/* A single durable request shared by devices; the outbound connector performs the work. */
export async function mealieDiscovery(req,env,{json,guard,pinOk}){
  const reply=(d,s=200)=>json(d,s,req,env),key=req.headers.get('X-Sync-Key');
  const service=!!key&&await pinOk(key,env.MEALIE_SYNC_KEY);
  if(key&&!service)return reply({error:'unauthorized'},401);
  if(!service){const denied=await guard(req,env);if(denied)return denied}
  if(!['GET','POST','PUT'].includes(req.method)||req.method==='PUT'&&!service||req.method==='POST'&&service)return reply({error:'method'},405);
  if(!env.MEALIE_SYNC_KEY)return reply({error:'unconfigured'},503);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS mealie_discovery (id INTEGER PRIMARY KEY CHECK(id=1),request_id TEXT NOT NULL,requested TEXT NOT NULL,status TEXT NOT NULL,finished TEXT,report TEXT)').run();
  const get=()=>env.DB.prepare('SELECT request_id,requested,status,finished,report FROM mealie_discovery WHERE id=1').first();
  if(req.method==='GET'){const row=await get();return reply({job:row?{...row,report:row.report?JSON.parse(row.report):null}:null})}
  if(req.method==='POST'){
    const now=Date.now(),row=await get();
    if(row&&(now-Date.parse(row.requested)<60000||['queued','running'].includes(row.status)&&now-Date.parse(row.requested)<180000))return reply({job:{...row,report:row.report?JSON.parse(row.report):null}});
    const id=crypto.randomUUID(),requested=new Date(now).toISOString();
    await env.DB.prepare("INSERT INTO mealie_discovery(id,request_id,requested,status,finished,report) VALUES(1,?,?,'queued',NULL,NULL) ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id,requested=excluded.requested,status='queued',finished=NULL,report=NULL").bind(id,requested).run();
    return reply({job:await get()},202);
  }
  let body;try{const text=await req.text();if(text.length>4000)return reply({error:'too_large'},413);body=JSON.parse(text)}catch(_){return reply({error:'bad_json'},400)}
  if(!body||!['running','ready','error'].includes(body.status)||typeof body.id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(body.id))return reply({error:'invalid'},400);
  const stats=body.report||{};if(!['scanned','accepted','rejected','errors'].every(k=>stats[k]===undefined||Number.isInteger(stats[k])&&stats[k]>=0&&stats[k]<=100))return reply({error:'invalid'},400);
  const report=JSON.stringify(Object.fromEntries(['scanned','accepted','rejected','errors'].filter(k=>stats[k]!==undefined).map(k=>[k,stats[k]])));
  const result=await env.DB.prepare('UPDATE mealie_discovery SET status=?,finished=?,report=? WHERE id=1 AND request_id=?').bind(body.status,body.status==='running'?null:new Date().toISOString(),report,body.id).run();
  return reply({ok:!!result.meta.changes},result.meta.changes?200:409);
}
