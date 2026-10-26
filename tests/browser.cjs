/* Only local test state is written. Requires local Wrangler and static HTTP server. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {core:a}=require('../scripts/app-core.cjs')();
const config=JSON.parse(fs.readFileSync(process.env.TEST_CONFIG||'/tmp/beslenme-test-config.json','utf8'));
const API='http://localhost:8787',SITE='http://localhost:8000';
const headers={'Content-Type':'application/json','X-Pin':config.pin};
async function state(){const r=await fetch(API+'/api/state',{headers});assert(r.ok);return r.json()}
async function put(data){const r=await fetch(API+'/api/state',{method:'PUT',headers,body:JSON.stringify(data)});assert(r.ok);return r.json()}
(async()=>{
  let d=await state();await put({base:d.v,hist:[a.generate([])],custom:[],prefs:{}});
  const cat=await(await fetch(API+'/api/mealie/catalog',{headers})).json();assert(cat.recipes.length>=62);const count=cat.recipes.length;
  const original=a.B[2],fixture={id:'f0000000-0000-4000-8000-000000000001',slug:'english-test',name:'English breakfast test',recipeServings:2,recipeIngredient:original.ing.map(i=>({quantity:i[1]+i[2],unit:{name:a.F[i[0]].u||'g'},food:{name:a.F[i[0]].n}})),recipeInstructions:[{text:'Prepare the ingredients and serve.'}],extras:{}};
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.addInitScript(pin=>localStorage.setItem('beslenme-pin',JSON.stringify(pin)),config.pin);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/mealie/catalog',async route=>{if(route.request().method()==='GET')await route.fulfill({json:{...cat,recipes:[fixture,...cat.recipes]}});else await route.continue()});
    await page.goto(SITE);await page.locator('#sync').filter({hasText:'Eşitlendi'}).waitFor();
    await page.locator('[data-tab="prefs"]').first().click();await page.locator('[data-mealie="load"]').click();
    await page.locator('text='+(count+1)+' tarif').waitFor();await page.locator('#mealie-query').fill('English breakfast');await page.locator('#mealie-search button').click();
    await page.locator('[data-mealie="import"]').click();assert(await page.locator('[data-act="rsave"]').isDisabled());
    // A source can remain English or be explicitly renamed in Turkish, without changing quantities.
    await page.locator('[data-f="name"]').fill('Türkçe deneme kahvaltısı');await page.locator('[data-kind="b"]').click();
    for(let i=0;i<original.ing.length;i++){
      await page.locator(`[data-row="${i}"][data-f="s"]`).fill(String(original.ing[i][1]));
      await page.locator(`[data-row="${i}"][data-f="r"]`).fill(String(original.ing[i][2]));
      await page.locator(`[data-row="${i}"][data-f="confirmed"]`).check();
    }
    assert(await page.locator('[data-act="rsave"]').isEnabled());await page.locator('[data-act="rsave"]').click();await page.waitForTimeout(500);
    d=await state();const imported=d.custom.find(r=>r.source?.id===fixture.id);assert(imported);assert.deepEqual(imported.ing,JSON.parse(JSON.stringify(original.ing.map(i=>[i[0],i[1],i[2],i[3]?1:0]))));
    assert.deepEqual(a.mac(imported.ing,1),a.mac(original.ing,1));assert.deepEqual(a.mac(imported.ing,2),a.mac(original.ing,2));
    // A used recipe must fork when edited so history keeps the original recipe and nutrients.
    d.hist[0].plans[0].b=imported.id;await put({base:d.v,hist:d.hist,custom:d.custom,prefs:d.prefs});await page.reload();
    await page.locator('[data-tab="prefs"]').first().click();await page.locator(`[data-redit="${imported.id}"]`).click();await page.locator('[data-f="name"]').fill('Yeni kopya kahvaltı');await page.locator('[data-act="rsave"]').click();await page.waitForTimeout(500);
    d=await state();assert.equal(d.hist[0].plans[0].b,imported.id);assert.equal(d.custom.find(x=>x.id===imported.id).name,'Türkçe deneme kahvaltısı');assert(d.custom.some(x=>x.id!==imported.id&&x.name==='Yeni kopya kahvaltı'));
    // Offline operation → reload → another device commits → reconnect must preserve both edits.
    await page.locator('[data-tab="shop"]').first().click();await context.setOffline(true);const checkbox=page.locator('[data-ck]').first();const key=await checkbox.getAttribute('data-ck');await checkbox.check();
    let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('beslenme-ops')));assert(saved.some(x=>x.k===key));
    await page.unroute('**/api/mealie/catalog');
    // Keep the local page available while API connectivity remains interrupted.
    await context.setOffline(false);await page.route('**/api/state',route=>route.abort('internetdisconnected'));await page.reload();
    saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('beslenme-ops')));assert(saved.some(x=>x.k===key));
    d=await state();d.prefs.b1=1;await put({base:d.v,hist:d.hist,custom:d.custom,prefs:d.prefs});
    await page.unroute('**/api/state');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('beslenme-dirty'))===false,{},{timeout:20000});
    d=await state();assert(d.hist[0].done.includes(key));assert.equal(d.prefs.b1,1);
    // An interrupted send without an online event is eventually retried by the timer.
    await page.route('**/api/state',route=>route.abort('internetdisconnected'));await page.locator('[data-ck]').first().uncheck();await page.waitForTimeout(500);assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('beslenme-dirty'))));await page.unroute('**/api/state');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('beslenme-dirty'))===false,{},{timeout:25000});
    assert.equal(errors.length,0,errors.join('\n'));
    await page.locator('[data-tab="prefs"]').first().click();await page.locator('[data-mealie="load"]').click();await page.locator('text='+count+' tarif').waitFor();
    await page.screenshot({path:process.env.SCREENSHOT||'/tmp/beslenme-mealie-mobile.png',fullPage:true});
    const cached=await browser.newContext({viewport:{width:390,height:844}});
    await cached.addInitScript(pin=>localStorage.setItem('beslenme-pin',JSON.stringify(pin)),config.pin);
    const offlinePage=await cached.newPage();offlinePage.on('pageerror',e=>errors.push(e.message));
    await offlinePage.goto(SITE);await offlinePage.locator('#sync').filter({hasText:'Eşitlendi'}).waitFor();
    await offlinePage.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await offlinePage.reload();
    await cached.setOffline(true);await offlinePage.reload();await offlinePage.locator('#view .card').first().waitFor();
    assert.equal(await offlinePage.evaluate(()=>typeof MealieAdapter.reviewed),'function');assert.equal(errors.length,0,errors.join('\n'));
    await browser.close();console.log('Browser OK: import review, Turkish rename, exact nutrients, history fork, offline reload/conflict, automatic retry, real offline service-worker reload; no page errors.');
  }finally{if(browser.isConnected())await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
