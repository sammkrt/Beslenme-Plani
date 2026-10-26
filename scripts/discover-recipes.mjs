import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Auto=require('../auto-recipes.js');
const AGENT='BeslenmePlani/1.0 (personal recipe planner)',ORIGIN='https://yemek.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function allowedURL(value){try{const u=new URL(value);return u.origin===ORIGIN&&!u.username&&!u.password&&!u.search&&!u.hash&&(/^\/tarif\/[a-z0-9-]+\/$/.test(u.pathname)||/^\/sitemaps\/[a-z0-9_-]+\.xml$/.test(u.pathname)||u.pathname==='/robots.txt')}catch(_){return false}}
export function robotsAllows(text,url){
  let active=false,rules=[];
  for(const line of text.split('\n')){const clean=line.replace(/#.*$/,'').trim(),i=clean.indexOf(':');if(i<0)continue;const key=clean.slice(0,i).toLowerCase(),value=clean.slice(i+1).trim();if(key==='user-agent'){active=value==='*';continue}if(active&&['allow','disallow'].includes(key)&&value)rules.push({allow:key==='allow',value})}
  const target=new URL(url).pathname;const matching=rules.filter(r=>{const pattern=r.value.split('*').map(x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*');try{return new RegExp('^'+pattern).test(target)}catch(_){return true}}).sort((a,b)=>b.value.length-a.value.length||Number(b.allow)-Number(a.allow));
  return !matching.length||matching[0].allow;
}
async function publicText(url,robots){
  if(!allowedURL(url)||robots&&!robotsAllows(robots,url))throw new Error('Source URL not permitted');
  let current=url;
  for(let hop=0;hop<4;hop++){
    const r=await fetch(current,{headers:{'User-Agent':AGENT},redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(r.status>=300&&r.status<400){current=new URL(r.headers.get('location'),current).href;if(!allowedURL(current)||robots&&!robotsAllows(robots,current))throw new Error('Source redirect not permitted');continue}
    if(!r.ok)throw new Error('Source HTTP '+r.status);
    const reader=r.body.getReader(),chunks=[];let bytes=0;
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2500000){await reader.cancel();throw new Error('Source too large')}chunks.push(value)}
    return Buffer.concat(chunks).toString('utf8');
  }throw new Error('Source redirects exceeded');
}
export function extractRecipe(html){
  const blocks=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];let recipe=null;
  function walk(x,depth=0){if(depth>12||!x||typeof x!=='object')return;if((Array.isArray(x['@type'])?x['@type']:[x['@type']]).includes('Recipe'))recipe=x;for(const v of Object.values(x))if(v&&typeof v==='object')if(Array.isArray(v))v.slice(0,200).forEach(i=>walk(i,depth+1));else walk(v,depth+1)}
  for(const b of blocks)try{walk(JSON.parse(b[1]))}catch(_){}
  if(!recipe)return null;
  const steps=[];function step(x){if(typeof x==='string')steps.push(x);else if(x&&Array.isArray(x.itemListElement))x.itemListElement.forEach(step);else if(typeof x?.text==='string')steps.push(x.text)}
  (Array.isArray(recipe.recipeInstructions)?recipe.recipeInstructions:[recipe.recipeInstructions]).forEach(step);
  const decode=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  return {name:decode(recipe.name),yield:decode(Array.isArray(recipe.recipeYield)?recipe.recipeYield[0]:recipe.recipeYield),ingredients:Array.isArray(recipe.recipeIngredient)?recipe.recipeIngredient.map(decode):[],steps:steps.map(decode)};
}
export function catalogItem(d){return {id:d.id,slug:d.slug,name:d.name,orgURL:d.orgURL||null,recipeServings:d.recipeServings,recipeIngredient:d.recipeIngredient.map(i=>({quantity:i.quantity,unit:i.unit?{name:i.unit.name,abbreviation:i.unit.abbreviation}:null,food:i.food?{name:i.food.name}:null,note:i.note,display:i.display,originalText:i.originalText})),recipeInstructions:d.recipeInstructions,nutrition:d.nutrition,extras:{beslenme_v1:d.extras?.beslenme_v1,beslenme_auto_v1:d.extras?.beslenme_auto_v1}}}
export async function discover({api,core,current,stateFile}){
  fs.mkdirSync(path.dirname(stateFile),{recursive:true,mode:0o700});let state={cursor:0,seen:{},lastRun:0};try{state={...state,...JSON.parse(fs.readFileSync(stateFile,'utf8'))}}catch(_){}
  const lock=stateFile+'.lock';let fd;
  try{fd=fs.openSync(lock,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e;if(Date.now()-fs.statSync(lock).mtimeMs>600000){fs.unlinkSync(lock);fd=fs.openSync(lock,'wx',0o600)}else return {busy:true}}
  const report={scanned:0,accepted:0,rejected:0,errors:0,started:new Date().toISOString()};
  try{
    const robots=await publicText(ORIGIN+'/robots.txt');
    const index=await publicText(ORIGIN+'/sitemaps/sitemap_index.xml',robots),maps=[...index.matchAll(/<loc>(https:\/\/yemek\.com\/sitemaps\/recipe-sitemap\d+\.xml)<\/loc>/g)].map(x=>x[1]);
    if(!maps.length)throw new Error('Recipe sitemap unavailable');
    let urls=state.urls||[];
    if(!urls.length||Date.now()-(state.urlsAt||0)>86400000){
      urls=[];for(const map of maps){await sleep(200);const xml=await publicText(map,robots);for(const x of xml.matchAll(/<loc>(https:\/\/yemek\.com\/tarif\/[a-z0-9-]+\/)<\/loc>/g))if(/tavuk|somon|kiyma|dana|morina|hindi/.test(x[1])&&!/corba|borek|pogaca|pizza|kizart|pane|burger|tost|salatasi|salata|krep|krema|manti|makarna|noodle|ramen|tatli|supangle|kazandibi/.test(x[1]))urls.push(x[1])}
      state.urls=urls;state.urlsAt=Date.now();
    }
    state.cursor=(state.cursor+2)%maps.length;
    const known=new Set(current.map(r=>r.orgURL).filter(Boolean));
    const score=url=>(/sote/.test(url)?6:0)+(/firinda|izgara/.test(url)?2:0)-url.length*.02+Math.random()*3;
    const candidates=[...new Set(urls)].filter(url=>!known.has(url)&&(!state.seen[url]||Date.now()-state.seen[url].at>7*86400000)).map(url=>({url,score:score(url)})).sort((a,b)=>b.score-a.score).slice(0,32).map(x=>x.url);
    for(const url of candidates){
      if(report.accepted>=5)break;await sleep(300);report.scanned++;
      try{
        const raw=extractRecipe(await publicText(url,robots)),draft=Auto.adapt(raw,core);
        if(draft.error){state.seen[url]={at:Date.now(),reason:draft.error};report.rejected++;continue}
        const result=await api('/api/recipes/create/url',{method:'POST',body:JSON.stringify({url,includeTags:false,includeCategories:false})}),slug=typeof result==='string'?result:result.slug;
        if(!slug)throw new Error('Mealie URL import failed');
        const d=await api('/api/recipes/'+encodeURIComponent(slug));
        // Re-validate Mealie's actual scraped content, not only the earlier HTTP copy.
        const check=Auto.adapt({name:d.name,yield:Number(d.recipeServings)>0?d.recipeServings+' kişilik':raw.yield,ingredients:d.recipeIngredient.map(i=>i.originalText||i.note||i.display),steps:(d.recipeInstructions||[]).map(s=>s.text)},core);
        if(check.error){state.seen[url]={at:Date.now(),reason:'Mealie: '+check.error};report.rejected++;continue}
        const id='a_'+crypto.createHash('sha256').update(url+'\n'+JSON.stringify(check.recipe)).digest('hex').slice(0,20);
        const recipe={...check.recipe,id,hidden:false,source:{id:d.id,name:d.name,slug:d.slug,url,auto:true,notes:check.notes}};
        const proof=Auto.proof(recipe,catalogItem(d),core.F,check.notes);
        await api('/api/recipes/'+encodeURIComponent(slug),{method:'PATCH',body:JSON.stringify({extras:{...d.extras,beslenme_auto_v1:JSON.stringify(proof)},settings:{...d.settings,public:false}})});
        state.seen[url]={at:Date.now(),reason:'accepted'};report.accepted++;
      }catch(e){report.errors++;state.seen[url]={at:Date.now(),reason:'Kaynak veya içe aktarma hatası'};console.error('Discovery candidate:',new URL(url).pathname,e.message)}
    }
    state.lastRun=Date.now();state.report=report;state.seen=Object.fromEntries(Object.entries(state.seen).sort((a,b)=>b[1].at-a[1].at).slice(0,1000));
    const temp=stateFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600});fs.renameSync(temp,stateFile);
    return report;
  }finally{if(fd!==undefined)fs.closeSync(fd);fs.unlinkSync(lock)}
}
