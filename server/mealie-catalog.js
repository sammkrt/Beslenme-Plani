/* Ayrı katalog: hiçbir zaman state veya state_backup'a yazmaz. */
const MAX_BYTES=1_500_000;
async function bodyText(req){
  const reader=req.body?.getReader();if(!reader)return '';
  const parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new RangeError('too_large')}parts.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}return new TextDecoder().decode(bytes);
}
export async function mealieCatalog(req,env,{json,guard,pinOk}){
  const reply=(d,s=200)=>json(d,s,req,env);
  if(req.method==='PUT'){
    if(!env.MEALIE_SYNC_KEY||!await pinOk(req.headers.get('X-Sync-Key'),env.MEALIE_SYNC_KEY))return reply({error:'unauthorized'},401);
    let body;try{body=JSON.parse(await bodyText(req))}catch(e){return reply({error:e instanceof RangeError?'too_large':'bad_json'},e instanceof RangeError?413:400)}
    if(!body||!Array.isArray(body.recipes)||body.recipes.length>300||!body.recipes.every(r=>r&&typeof r.id==='string'&&/^[a-z0-9-]{1,64}$/i.test(r.id)&&typeof r.slug==='string'&&r.slug.length>0&&r.slug.length<=200&&typeof r.name==='string'&&r.name.length>0&&r.name.length<=300&&Array.isArray(r.recipeIngredient)&&r.recipeIngredient.length<=100&&Array.isArray(r.recipeInstructions)&&r.recipeInstructions.length<=100)||new Set(body.recipes.map(r=>r.id)).size!==body.recipes.length)return reply({error:'invalid'},400);
    await ensure(env);
    const updated=new Date().toISOString();
    const out=await env.DB.batch([
      env.DB.prepare('INSERT INTO state_backup (v,data,updated,saved) SELECT v,data,updated,? FROM state WHERE id=1 AND NOT EXISTS (SELECT 1 FROM mealie_catalog WHERE id=1)').bind(updated),
      env.DB.prepare('INSERT INTO mealie_catalog (id,data,updated) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(JSON.stringify(body.recipes),updated),
    ]);
    return reply({count:body.recipes.length,updated,backupCreated:out[0].meta.changes});
  }
  if(req.method!=='GET')return reply({error:'method'},405);
  const denied=await guard(req,env);if(denied)return denied;
  await ensure(env);
  const row=await env.DB.prepare('SELECT data,updated FROM mealie_catalog WHERE id=1').first();
  return reply({recipes:row?JSON.parse(row.data):[],updated:row?.updated||null,configured:!!env.MEALIE_SYNC_KEY,home:env.MEALIE_HOME||null});
}
async function ensure(env){
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS mealie_catalog (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,updated TEXT NOT NULL)').run();
}
