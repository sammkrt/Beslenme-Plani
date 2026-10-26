import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {catalogItem,discover} from './discover-recipes.mjs';
const require=createRequire(import.meta.url),loadCore=require('./app-core.cjs'),adapter=require('../mealie-adapter.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(process.env.MEALIE_CONFIG||path.join(root,'deploy/mealie/credentials.json'),'utf8'));
async function api(route,options={}){
  const r=await fetch((process.env.MEALIE_URL||config.url)+route,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token,...options.headers},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('Mealie HTTP '+r.status+' '+route);
  return r.json();
}
async function list(){
  const out=[];for(let page=1;;page++){
    const d=await api('/api/recipes?perPage=50&page='+page+'&orderBy=name&orderDirection=asc');out.push(...d.items);
    if(page>=d.total_pages)break;
    if(page>100)throw new Error('Catalogue exceeds 5000 recipes');
  }return out;
}
async function seed(){
  const {core:a}=loadCore(),existing=await catalogue(),created=[];
  for(const [pool,kind] of [[a.B,'b'],[a.S,'s'],[a.D,'d'],[a.Z,'z']])for(const recipe of pool){
    const key='beslenme-'+recipe.id;
    if(existing.some(x=>{try{return JSON.parse(x.extras?.beslenme_v1||'null')?.recipe?.id===recipe.id}catch(_){return false}}))continue;
    // Mealie derives slugs from titles; extras provide the stable application id.
    const partial=existing.find(x=>x.slug===key);
    const slug=partial?.slug||await api('/api/recipes',{method:'POST',body:JSON.stringify({name:key})});
    const item=await api('/api/recipes/'+encodeURIComponent(slug));
    const snap=adapter.snapshot(recipe,a.F,kind),m=a.mac(recipe.ing,1);
    Object.assign(item,{name:recipe.name,slug:key,recipeServings:1,recipeYieldQuantity:1,recipeYield:'Samet için 1 günlük porsiyon; Raşe miktarları notlarda',description:'Beslenme Planı • Türkçe • kişiye özel miktarlar extras alanında korunur. Besin değerleri Samet için temel tarife aittir; haftalık dengeleme öncesidir.',recipeIngredient:recipe.ing.map(i=>({quantity:i[1],unit:null,food:null,note:a.F[i[0]].n+' — Samet '+i[1]+' '+(a.F[i[0]].u||'g')+', Raşe '+i[2]+' '+(a.F[i[0]].u||'g')+(i[3]?' • her gün taze':''),display:'',originalText:a.F[i[0]].n})),recipeInstructions:recipe.steps.map(text=>({text})),nutrition:{calories:String(m[0]),proteinContent:String(m[1]),carbohydrateContent:String(m[2]),fatContent:String(m[3]),fiberContent:String(m[4])},extras:{...item.extras,beslenme_v1:JSON.stringify(snap)},settings:{...item.settings,public:false,showNutrition:true,disableAmount:true}});
    await api('/api/recipes/'+encodeURIComponent(slug),{method:'PUT',body:JSON.stringify(item)});created.push(key);
  }
  console.log(JSON.stringify({seeded:created.length}));
}
async function catalogue(all=false){
  const out=[];for(const r of await list()){
    const d=await api('/api/recipes/'+encodeURIComponent(r.slug));
    out.push(catalogItem(d));
  }
  if(all)return out;
  const created=r=>{try{return Date.parse(JSON.parse(r.extras.beslenme_auto_v1).created)||0}catch(_){return 0}};
  const automatic=out.filter(r=>r.extras.beslenme_auto_v1).sort((a,b)=>created(b)-created(a)).slice(0,80),ordinary=out.filter(r=>!r.extras.beslenme_auto_v1);
  return [...ordinary,...automatic];
}
async function sync(){
  const recipes=await catalogue();
  if(process.argv.includes('--verify')){
    const {core:a}=loadCore();let verified=0;
    for(const pool of [a.B,a.S,a.D,a.Z])for(const r of pool){
      const d=recipes.find(x=>adapter.readSnapshot(x,a.F)?.recipe.id===r.id),s=d&&adapter.readSnapshot(d,a.F);
      if(!s||JSON.stringify(s.recipe.ing)!==JSON.stringify(r.ing)||JSON.stringify(a.mac(s.recipe.ing,1))!==JSON.stringify(a.mac(r.ing,1))||JSON.stringify(a.mac(s.recipe.ing,2))!==JSON.stringify(a.mac(r.ing,2)))throw new Error('Roundtrip mismatch: '+r.id);
      const m=a.mac(r.ing,1),fields=['calories','proteinContent','carbohydrateContent','fatContent','fiberContent'];
      if(!fields.every((k,i)=>Number(d.nutrition?.[k])===m[i]))throw new Error('Visible nutrition mismatch: '+r.id);
      verified++;
    }console.log(JSON.stringify({verified,recipes:recipes.length}));return;
  }
  if(!config.worker||!config.syncKey){console.log(JSON.stringify({recipes:recipes.length,published:false}));return}
  const r=await fetch(config.worker+'/api/mealie/catalog',{method:'PUT',headers:{'Content-Type':'application/json','X-Sync-Key':config.syncKey},body:JSON.stringify({recipes}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('Worker HTTP '+r.status);
  const result=await r.json();console.log(JSON.stringify({published:recipes.length,backupCreated:result.backupCreated}));
}
if(process.argv.includes('--seed'))await seed();
const stateFile=process.env.MEALIE_DISCOVERY_STATE||path.join(root,'deploy/mealie/runtime/discovery.json');
async function jobAPI(method='GET',body){
  if(!config.worker||!config.syncKey)return null;
  const r=await fetch(config.worker+'/api/mealie/discover',{method,headers:{'Content-Type':'application/json','X-Sync-Key':config.syncKey},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('Discovery worker HTTP '+r.status);return r.json();
}
async function scan(job){
  if(job)await jobAPI('PUT',{id:job.request_id,status:'running'});
  try{
    const report=await discover({api,core:loadCore().core,current:await catalogue(true),stateFile});
    if(report.busy)return;
    await sync();if(job)await jobAPI('PUT',{id:job.request_id,status:'ready',report});console.log(JSON.stringify({discovery:report}));
  }catch(e){if(job)await jobAPI('PUT',{id:job.request_id,status:'error',report:{errors:1}});throw e}
}
if(process.argv.includes('--discover'))await scan();
if(process.argv.includes('--watch')){
  let lastSync=0,nextBackground=0;
  try{nextBackground=JSON.parse(fs.readFileSync(stateFile,'utf8')).lastRun+86400000}catch(_){}
  while(true){
    try{
      const {job}=await jobAPI()||{};
      if(job&&(job.status==='queued'||job.status==='running'&&Date.now()-Date.parse(job.requested)>120000)){await scan(job);lastSync=Date.now();nextBackground=Date.now()+86400000}
      else if(Date.now()>nextBackground){nextBackground=Date.now()+900000;await scan();lastSync=Date.now();nextBackground=Date.now()+86400000}
      if(Date.now()-lastSync>60000){await sync();lastSync=Date.now()}
    }catch(e){console.error(e.message)}
    await new Promise(r=>setTimeout(r,5000));
  }
}else if(!process.argv.includes('--discover'))await sync();
