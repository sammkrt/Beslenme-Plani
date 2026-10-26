const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('../scripts/app-core.cjs');
const Auto=require('../auto-recipes.js');
const sample=()=>({name:'Tavuklu sebze tavası',yield:'2 kişilik',ingredients:['300 gram tavuk göğsü','1 adet soğan','1 adet yeşil biber','1 adet domates','2 yemek kaşığı zeytinyağı','1 çay kaşığı tuz'],steps:['Tavuk ve sebzeleri ölçülü yağ ile tavada pişirin.']});
function candidate(a){const d=Auto.adapt(sample(),a);assert(d.recipe,d.error);return {...d.recipe,id:'a_01234567890123456789',source:{id:'00000000-0000-4000-8000-000000000001',url:'https://yemek.com/tarif/test-tavuk/',auto:true,notes:d.notes}}}
test('realistic Turkish source adapts only known ingredients and declares standard measures/sides',()=>{
  const a=load().core,d=Auto.adapt(sample(),a);assert(d.recipe);assert(a.validRecipe({...d.recipe,two_day:true},'d'));assert(d.notes.some(n=>n.includes('standart')));
  assert(d.recipe.ing.every(i=>Object.hasOwn(a.F,i[0])));assert(d.recipe.steps.every(s=>s.length<=300));
});
test('fish recipes retain the single-day dinner category',()=>{
  const a=load().core,raw=sample();raw.name='Sebzeli somon';raw.ingredients[0]='400 gram somon fileto';const d=Auto.adapt(raw,a);assert(d.recipe,d.error);assert.equal(d.recipe.kind,'z');assert.equal(d.recipe.two,false);
});
test('grain rotation keeps the matching cooking instructions and separate yogurt side',()=>{
  const a=load().core,r=candidate(a);r.steps=[...r.steps.filter(s=>!s.startsWith('Bulguru ')),a.GR.bulgur[1],'Yağsız yoğurdu ayrı servis edin.'];a.addCustom(r);
  const v=a.view({d:r.id,g:'pirinc'},'d');assert(v.steps.includes(a.GR.pirinc[1]));assert(v.steps.some(s=>s.includes('yoğurdu')));
});
test('unknown ingredients, unmeasured calories, unsafe food-state conversions and unknown yields are rejected',()=>{
  const a=load().core;
  for(const line of ['2 yemek kaşığı krema','aldığı kadar un','1 su bardağı haşlanmış bulgur','1 küçük tavuk göğsü','1/0 gram tavuk göğsü','250 gram badem unu']){
    const r=sample();r.ingredients.push(line);assert(Auto.adapt(r,a).error,line);
  }
  const r=sample();r.yield='1 tepsi';assert(Auto.adapt(r,a).error);
});
test('automatically approved recipes require unchanged Mealie content and food-table signatures',()=>{
  const a=load().core,r=candidate(a),source={id:r.source.id,name:'Original title',recipeIngredient:[],recipeInstructions:[],extras:{}};
  source.extras.beslenme_auto_v1=JSON.stringify(Auto.proof(r,source,a.F,r.source.notes));assert(Auto.read(source,a));
  source.name='Edited title';assert.equal(Auto.read(source,a),null);source.name='Original title';
  const changed=load().core;changed.F.tavuk.m[0]++;assert.equal(Auto.read(source,changed),null);
});
test('new internet dinner enters a complete week that meets both targets; temporary recipes never leak',()=>{
  const a=load().core,r=candidate(a),before=a.D.map(r=>r.id),result=Auto.plan(a,[],[r],new Date(2026,9,26));assert(!result.error,result.error);assert.equal(result.recipes.length,1);
  assert.deepEqual(a.D.map(r=>r.id),before);assert(!a.ALL[r.id]);
  result.recipes.forEach(a.addCustom);assert(result.week.plans.every(p=>Auto.fits(p,a)));assert(a.validDays(result.week.plans));a.shopping(a.build(result.week));
});
test('52 weeks remain within both targets and keep unique breakfasts/snacks and valid day layouts',()=>{
  const a=load().core,h=[];
  for(let i=0;i<52;i++){
    const result=Auto.plan(a,h,[],new Date(2026,9,26));assert(!result.error,'week '+i+': '+result.error);
    assert(result.week.plans.every(p=>Auto.fits(p,a)));assert.equal(new Set(result.week.plans.map(p=>p.b)).size,4);assert.equal(new Set(result.week.plans.map(p=>p.s)).size,4);
    h.push(result.week);if(h.length>26)h.shift();
  }
});
test('disliked source recipes and impossible targets cannot be forced into the plan',()=>{
  const a=load().core,r=candidate(a);a.addCustom({...r,id:'c_previous'});a.PREFS.c_previous=-1;
  const result=Auto.plan(a,[],[r]);assert(!result.error);assert.equal(result.recipes.length,0);assert(!result.week.plans.some(p=>p.d==='c_previous'));
  const before=JSON.stringify(a.D.map(r=>r.id));a.T.s.pmin=10000;assert(Auto.plan(a,[],[r]).error);assert.equal(JSON.stringify(a.D.map(r=>r.id)),before);
});
