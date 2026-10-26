import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
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
    Object.assign(item,{name:recipe.name,slug:key,recipeServings:1,recipeYieldQuantity:1,recipeYield:'Samet için 1 günlük porsiyon; Raşe miktarları notlarda',description:'Beslenme Planı • Türkçe • kişiye özel miktarlar extras alanında korunur. Besin değerleri Samet için temel tarife aittir; haftalık dengeleme öncesidir.',recipeIngredient:recipe.ing.map(i=>({quantity:i[1],unit:null,food:null,note:a.F[i[0]].n+' — Samet '+i[1]+' '+(a.F[i[0]].u||'g')+', Raşe '+i[2]+' '+(a.F[i[0]].u||'g')+(i[3]?' • her gün taze':''),display:'',originalText:a.F[i[0]].n})),recipeInstructions:recipe.steps.map(text=>({text})),nutrition:{calories:String(m[0]),proteinContent:String(m[1]),carbohydrateContent:String(m[2]),fatContent:String(m[3]),fiberContent:String(m[4])},extras:{...item.extras,beslenme_v1:JSON.stringify(snap)},settings:{...item.settings,public:false,disableAmount:true}});
    await api('/api/recipes/'+encodeURIComponent(slug),{method:'PUT',body:JSON.stringify(item)});created.push(key);
  }
  console.log(JSON.stringify({seeded:created.length}));
}
async function catalogue(){
  const out=[];for(const r of await list()){
    const d=await api('/api/recipes/'+encodeURIComponent(r.slug));
    out.push({id:d.id,slug:d.slug,name:d.name,recipeServings:d.recipeServings,recipeIngredient:d.recipeIngredient.map(i=>({quantity:i.quantity,unit:i.unit?{name:i.unit.name,abbreviation:i.unit.abbreviation}:null,food:i.food?{name:i.food.name}:null,note:i.note,display:i.display,originalText:i.originalText})),recipeInstructions:d.recipeInstructions,nutrition:d.nutrition,extras:{beslenme_v1:d.extras?.beslenme_v1}});
  }return out;
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
if(process.argv.includes('--watch')){
  while(true){try{await sync()}catch(e){console.error(e.message)}await new Promise(r=>setTimeout(r,60000))}
}else await sync();
