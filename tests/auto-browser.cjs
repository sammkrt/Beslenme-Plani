const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const {core:a}=require('../scripts/app-core.cjs')(),Auto=require('../auto-recipes.js');
const c=JSON.parse(fs.readFileSync(process.env.TEST_CONFIG||'/tmp/beslenme-test-config.json')),API='http://localhost:8787',headers={'Content-Type':'application/json','X-Pin':c.pin};
async function state(){return (await fetch(API+'/api/state',{headers})).json()}
async function put(body){const r=await fetch(API+'/api/state',{method:'PUT',headers,body:JSON.stringify(body)});assert(r.ok);return r.json()}
(async()=>{
  const cat=await(await fetch(API+'/api/mealie/catalog',{headers})).json();assert(cat.recipes.some(r=>Auto.read(r,a)),'Actual internet candidates must be present');
  let d=await state();const original=a.generate([]);await put({base:d.v,hist:[original],custom:[],prefs:{}});
  const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  try{
    const context=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(pin=>localStorage.setItem('beslenme-pin',JSON.stringify(pin)),c.pin);
    await page.route('**/api/mealie/discover',route=>route.fulfill({json:{job:{request_id:'test',status:'ready'}}}));
    await page.goto('http://localhost:8000');await page.locator('#sync').filter({hasText:'Eşitlendi'}).waitFor();await page.locator('[data-tab="week"]').first().click();
    // Queue a whole week plus its recipe copies, then replay it after a device conflict.
    await page.route('**/api/state',route=>route.request().method()==='PUT'?route.abort('internetdisconnected'):route.continue());
    await page.locator('#wnew').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('beslenme-hist')).length===2);
    let ops=await page.evaluate(()=>JSON.parse(localStorage.getItem('beslenme-ops')));assert(ops.some(o=>o.t==='new'&&o.recipes.length>0));
    await page.reload();await page.locator('#view .card').first().waitFor();
    d=await state();d.prefs.b1=1;await put({base:d.v,hist:d.hist,custom:d.custom,prefs:d.prefs});
    await page.unroute('**/api/state');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(()=>JSON.parse(localStorage.getItem('beslenme-dirty'))===false,{},{timeout:20000});
    d=await state();assert.equal(d.hist.length,2);assert.equal(JSON.stringify(d.hist[0]),JSON.stringify(original));assert.equal(d.prefs.b1,1);
    const imported=d.custom.filter(r=>r.source?.auto);assert(imported.length>0);d.custom.forEach(a.addCustom);assert(d.hist[1].plans.every(p=>Auto.fits(p,a)));
    // Removing source availability must not prevent opening an already generated week.
    await page.route('**/api/mealie/**',route=>route.abort());await page.reload();await page.locator('#view .card').first().waitFor();assert.equal(errors.length,0,errors.join('\n'));
    await page.locator('[data-tab="week"]').first().click();await page.screenshot({path:'/tmp/beslenme-auto-week.png',fullPage:true});
    // A service outage still permits a valid week from existing recipes. Removed custom
    // recipes must not survive in the in-memory pools after adopting another device's state.
    d=await state();const reset=await put({base:d.v,hist:[original],custom:[],prefs:{}});await page.reload();await page.waitForFunction(v=>JSON.parse(localStorage.getItem('beslenme-ver'))===v&&JSON.parse(localStorage.getItem('beslenme-custom')).length===0,reset.v);
    await page.locator('[data-tab="week"]').first().click();await page.locator('#wnew').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('beslenme-hist')).length===2);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('beslenme-dirty'))===false);
    d=await state();assert.equal(d.custom.length,0);assert(d.hist[1].plans.every(p=>!p.d.startsWith('a_')));assert(d.hist[1].plans.every(p=>Auto.fits(p,a)));
    console.log('Automatic week Chrome OK:',imported.length,'real internet recipes; both targets met, previous week unchanged, offline/conflict replay preserved recipe snapshots.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
