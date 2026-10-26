const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const vm=require('node:vm');
const load=require('../scripts/app-core.cjs');
const adapter=require('../mealie-adapter.js');
const plain=x=>JSON.parse(JSON.stringify(x));
test('100 weeks retain original nutrient, portion, day and shopping calculations',()=>{
  const {core:a,context}=load();
  vm.runInContext('let seed=1234567; Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296)',context);
  const h=crypto.createHash('sha256');let hist=[];
  for(let i=0;i<100;i++){
    const w=a.generate(hist,undefined,new Date(2026,9,26)),plans=a.build(w);
    assert(a.validDays(w.plans));assert(plans.every(p=>['s','r'].every(k=>p.tot[k].every(Number.isFinite))));
    h.update(JSON.stringify({w,plans,shopping:a.shopping(plans)}));hist.push(w);if(hist.length>26)hist.shift();
  }
  assert.equal(h.digest('hex'),require('./baseline.json').sha256);
});
test('all 62 recipes preserve both portions and food signatures through Mealie extras',()=>{
  const {core:a}=load();let count=0;
  for(const [pool,kind] of [[a.B,'b'],[a.S,'s'],[a.D,'d'],[a.Z,'z']])for(const r of pool){
    const source={id:'test',name:r.name,extras:{beslenme_v1:JSON.stringify(adapter.snapshot(r,a.F,kind))}};
    const s=adapter.readSnapshot(source,a.F);assert(s,r.id);
    assert.deepEqual(plain(a.mac(s.recipe.ing,1)),plain(a.mac(r.ing,1)));
    assert.deepEqual(plain(a.mac(s.recipe.ing,2)),plain(a.mac(r.ing,2)));count++;
  }assert.equal(count,62);
});
test('changed food values invalidate the exact snapshot rather than silently change nutrition',()=>{
  const {core:a}=load(),r=a.B[0],source={extras:{beslenme_v1:adapter.snapshot(r,a.F,'b')}};
  const changed=plain(a.F);changed[r.ing[0][0]].m[0]++;
  assert.equal(adapter.readSnapshot(source,changed),null);
});
test('English import only proposes known gram quantities, and every row requires review',()=>{
  const {core:a}=load();const e=adapter.draft({id:'a',name:'Chicken dinner',recipeServings:4,recipeIngredient:[{quantity:1,unit:{name:'kg'},food:{name:'chicken breast'}},{quantity:2,unit:{name:'cups'},food:{name:'bulgur'}},{quantity:50,unit:{name:'g'},food:{name:'mystery powder'}}]},a.F);
  assert.equal(e.rows[0].k,'tavuk');assert.equal(e.rows[0].s,250);assert.equal(e.rows[1].s,'');assert.equal(e.rows[2].k,'');
  assert.equal(adapter.reviewed(e),false);e.rows[0].confirmed=true;assert.equal(adapter.reviewed(e),false);
});
test('missing servings, piece units and malformed snapshot never receive guessed quantities',()=>{
  const {core:a}=load();const e=adapter.draft({extras:{beslenme_v1:'broken'},recipeIngredient:[{quantity:4,food:{name:'eggs'}}]},a.F);
  assert.equal(e.rows[0].s,'');assert.equal(adapter.reviewed(e),false);
  assert.equal(adapter.foodKey('__proto__',a.F),'');
});
test('Mealie edits invalidate old snapshots and require a new review',()=>{
  const {core:a}=load(),r=a.B[0],extras={beslenme_v1:adapter.snapshot(r,a.F,'b')};
  assert.equal(adapter.readSnapshot({name:'Changed title',extras},a.F),null);
  assert.equal(adapter.readSnapshot({extras,recipeInstructions:[{text:'Changed instructions'}]},a.F),null);
  assert.equal(adapter.readSnapshot({extras,recipeIngredient:[]},a.F),null);
});
