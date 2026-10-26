/* Deterministic internet-recipe adaptation and weekly target verification. */
(function(root){
  'use strict';
  const norm=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/\s+/g,' ').trim();
  const names={
    'tavuk gogsu':'tavuk','kusbasi tavuk gogsu':'tavuk','tavuk gogus':'tavuk','fileto tavuk gogsu':'tavuk','derisiz tavuk but fileto':'but','kemiksiz tavuk kalca':'but','kemiksiz but eti':'but',
    'yagsiz dana kiyma':'kiyma','az yagli dana kiyma':'kiyma','dana kiyma':'kiyma','dana kiymasi':'kiyma','kiyma':'kiyma',
    'somon fileto':'somon','somon':'somon','morina fileto':'morina',
    'yumurta':'yumurta','zeytinyagi':'zyag','sivi yag':'zyag','yagsiz yogurt':'yogurt','yogurt':'yogurt',
    'pilavlik bulgur':'bulgur','bulgur':'bulgur','basmati pirinc':'pirinc','basmati pirinci':'pirinc',
    'kirmizi mercimek':'kmercimek','haslanmis nohut':'nohut','konserve nohut':'nohut',
    'domates':'domates','sogan':'sogan','kuru sogan':'sogan','biber':'biber','yesil biber':'biber','kirmizi biber':'biber','kapya biber':'biber','sivri biber':'biber',
    'kabak':'kabak','patlican':'patlican','havuc':'havuc','mantar':'mantar','kultur mantari':'mantar','dolmalik biber':'biber','ispanak':'ispanak','patates':'patates','brokoli':'brokoli','karnabahar':'karnabahar',
    'domates salcasi':'salca','biber salcasi':'salca','salca':'salca','domates puresi':'passata','passata':'passata','kirmizi mercimek':'kmercimek'
  };
  const spices=new Set(['tuz','karabiber','pul biber','kirmizi toz biber','toz kirmizi biber','kuru nane','kekik','kimyon','zerdecal','tarcin']);
  const units=[['yemek kasigi',15,'ml'],['tatli kasigi',7,'ml'],['cay kasigi',3,'ml'],['su bardagi',200,'ml'],['cay bardagi',100,'ml'],['kilogram',1000,'g'],['kg',1000,'g'],['gram',1,'g'],['gr',1,'g'],['g',1,'g'],['mililitre',1,'ml'],['ml',1,'ml'],['litre',1000,'ml'],['adet',1,'piece'],['tane',1,'piece'],['tutam',1,'pinch']];
  const density={zyag:.92,yogurt:1.03,bulgur:.8,pirinc:.85,kmercimek:.85,salca:1.1};
  const pieceGram={tavuk:200,but:100,somon:150,morina:150}; // Existing application's standard piece weights.
  function quantity(s){if(s==='yarim')return .5;if(s==='ceyrek')return .25;if(s.includes(' ')){const [a,b]=s.split(' ');return +a+quantity(b)}if(s.includes('/')){const[a,b]=s.split('/');return +a/+b}return +s.replace(',','.')}
  function ingredient(raw,F){
    let text=norm(raw).replace(/½/g,'1/2').replace(/¼/g,'1/4').replace(/¾/g,'3/4');
    if(/buyuk|kucuk|aldigi kadar|arzuya gore|istege gore|kizartmak icin/.test(text))return {error:'Belirsiz miktar'};
    const m=text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|yarim|ceyrek)\s+(.+)$/);
    if(!m)return spices.has(text)?{spice:String(raw).slice(0,30)}:{error:'Miktar okunamadı'};
    const q=quantity(m[1]);if(!Number.isFinite(q)||q<=0||q>5000)return {error:'Miktar sınır dışında'};
    text=m[2];let unit=null;for(const u of units)if(text===u[0]||text.startsWith(u[0]+' ')){unit=u;text=text.slice(u[0].length).trim();break}
    const originalFood=text;
    text=text.replace(/\([^)]*\)/g,'').replace(/[()]/g,'').replace(/\b(orta boy|dogranmis|rendelenmis|kusbasi dogranmis|ince dogranmis|taze)\b/g,'').replace(/\s+/g,' ').trim();
    if(text==='su')return {water:true};
    if(spices.has(text)){
      if(text!=='tuz'&&!(unit&&(unit[2]==='pinch'&&q<=1||unit[2]==='ml'&&q*unit[1]<=3)))return {error:'Baharat miktarı belirsiz veya büyük'};
      return {spice:raw.replace(/^.*?\s(?=[a-zA-ZçğıöşüÇĞİÖŞÜ])/, '').slice(0,30)};
    }
    const k=names[text];if(!k||!Object.hasOwn(F,k))return {error:'Bilinmeyen besin: '+text};
    if(/haslanmis|pismis|pisirilmis|konserve/.test(originalFood)&&!['nohut'].includes(k))return {error:'Çiğ/pişmiş eşlemesi belirsiz'};
    const f=F[k];let amount,estimated=false;
    if(!unit||unit[2]==='piece'){
      if(f.u==='adet')amount=q;else if(f.piece||pieceGram[k]){amount=q*(f.piece||pieceGram[k]);estimated=true}else return {error:'Adet gramajı bilinmiyor'};
    }else if(unit[2]==='g'&&!['adet','ölçek','ml'].includes(f.u))amount=q*unit[1];
    else if(unit[2]==='ml'&&density[k]){amount=q*unit[1]*density[k];estimated=true}
    else return {error:'Birim dönüştürülemiyor'};
    return {k,amount,estimated,adapted:text==='sivi yag'?'Kaynağın sıvı yağı yerine zeytinyağı kullanılır.':k==='yogurt'&&text==='yogurt'?'Yağsız yoğurt kullanılır.':k==='kiyma'?'Yağsız dana kıyma kullanılır.':k==='but'?'Derisiz, kemiksiz tavuk but fileto kullanılır.':null};
  }
  function compactSteps(steps,side){
    const source=steps.map(s=>String(s).replace(/(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|yarım|çeyrek)\s*(?:gram|kilogram|kg|adet|tane|yemek kaşığı|tatlı kaşığı|çay kaşığı|su bardağı|çay bardağı)(?=\s|[.,;]|$)/gi,'').replace(/\s+/g,' ').trim()).join(' ');
    const words=('Miktarlarda kişisel malzeme tablosunu esas alın. '+source).split(/\s+/),out=[];let line='';
    for(const w of words){if(w.length>280)return null;if((line+' '+w).trim().length>280){out.push(line);line=w}else line=(line+' '+w).trim()}
    if(line)out.push(line);if(Array.isArray(side))out.push(...side);else if(side)out.push(side);return out.length<=6?out:null;
  }
  function adapt(raw,core){
    if(!raw||typeof raw.name!=='string'||raw.name.length<4||!Array.isArray(raw.ingredients)||!raw.ingredients.length||raw.ingredients.length>35||!Array.isArray(raw.steps)||!raw.steps.length)return {error:'Tarif yapısı okunamadı'};
    const serving=String(raw.yield||'').match(/^(\d+)\s*kişilik$/i);if(!serving||+serving[1]<1||+serving[1]>12)return {error:'Kişi sayısı belirsiz'};
    if(/bol yağda kızart|derin yağ|yağda yüz|kızartmak için|marine.*(?:gece|24 saat)/i.test(raw.steps.join(' ')))return {error:'Pişirme yöntemi otomatik uyarlamaya uygun değil'};
    const total={},spice=[],notes=[];let estimated=false;
    for(const line of raw.ingredients){const p=ingredient(line,core.F);if(p.error)return {error:p.error,line};if(p.water)continue;if(p.spice){spice.push(p.spice);continue}total[p.k]=(total[p.k]||0)+p.amount;estimated ||= p.estimated;if(p.adapted&&!notes.includes(p.adapted))notes.push(p.adapted)}
    const prot=Object.keys(total).filter(k=>core.F[k].prot);if(!prot.length)return {error:'Hesaplanabilir protein kaynağı yok'};
    if(spice.length>6)return {error:'Çok fazla baharat satırı'};
    const main=prot.sort((a,b)=>total[b]*core.F[b].m[1]-total[a]*core.F[a].m[1])[0];
    const pt=main==='tavuk'||main==='but'?'tavuk':main==='kiyma'?'kiyma':['somon','morina','levrek','ton'].includes(main)?'balik':'et';
    let best=null;
    for(const scale of [.9,1,1.1,1.2,1.35,1.5,1.65])for(const mode of [0,1,2,3]){
      const addGrain=!!(mode&1)&&!Object.keys(total).some(k=>core.F[k].flex),addYogurt=!!(mode&2)&&!total.yogurt;
      if((mode&1)&&!addGrain||(mode&2)&&!addYogurt)continue;
      const ing=Object.entries(total).map(([k,v])=>[k,+(v/+serving[1]*scale).toFixed(2),+(v/+serving[1]*scale*.8).toFixed(2),0]);
      if(addGrain)ing.push(['bulgur',45,35,1]);if(addYogurt)ing.push(['yogurt',125,100,1]);
      const side=[addGrain?core.GR.bulgur[1]:'',addYogurt?'Tablodaki yağsız yoğurdu ayrı servis edin.':''].filter(Boolean),steps=compactSteps(raw.steps,side);
      if(!steps)continue;
      const name=(raw.name+(addGrain?' + bulgur':'')+(addYogurt?' + yoğurt':''));if(name.length>90)continue;
      const r=core.validRecipe({name,ing,steps,spice,pt,two_day:pt!=='balik'},pt==='balik'?'z':'d');if(!r)continue;
      const score=Math.abs(core.mac(ing,1)[0]-650)+Math.abs(core.mac(ing,2)[0]-510)+mode*20+Math.abs(scale-1)*50;
      if(!best||score<best.score)best={recipe:r,score,notes:[...notes,...(estimated?['Adet ve kaşık ölçüleri uygulamanın standart mutfak gramajlarıyla hesaplandı.']:[]),...(side.length?['Dengeli öğün için '+[addGrain?'bulgur':'',addYogurt?'yağsız yoğurt':''].filter(Boolean).join(' ve ')+' eklendi.']:[])]};
    }
    return best||{error:'Kişisel öğün sınırlarına uyarlanamadı'};
  }
  const projection=r=>JSON.stringify({name:r.name,ingredients:r.recipeIngredient.map(i=>[i.quantity,i.unit?.name||null,i.unit?.abbreviation||null,i.food?.name||null,i.note||null,i.display||null,i.originalText||null]),steps:r.recipeInstructions.map(i=>i.text)});
  function proof(recipe,source,foods,notes){return {schema:1,created:new Date().toISOString(),recipe,foods:Object.fromEntries(recipe.ing.map(i=>[i[0],{u:foods[i[0]].u||'g',m:foods[i[0]].m}])),projection:projection(source),notes}}
  function read(source,core){
    try{
      const raw=source.extras?.beslenme_auto_v1,p=typeof raw==='string'?JSON.parse(raw):raw;
      if(!p||p.schema!==1||p.projection!==projection(source)||!p.recipe?.source?.auto||p.recipe.source.id!==source.id||!/^https:\/\/yemek\.com\/tarif\/[a-z0-9-]+\/$/.test(p.recipe.source.url)||!/^a_[a-f0-9]{20}$/.test(p.recipe.id))return null;
      if(!p.recipe.ing.every(i=>Object.hasOwn(core.F,i[0])&&JSON.stringify(p.foods[i[0]])===JSON.stringify({u:core.F[i[0]].u||'g',m:core.F[i[0]].m})))return null;
      if(!['d','z'].includes(p.recipe.kind))return null;
      const r=core.validRecipe({...p.recipe,two_day:p.recipe.kind==='d'},p.recipe.kind);return r?{...r,id:p.recipe.id,hidden:false,source:{...p.recipe.source,auto:true,notes:p.notes}}:null;
    }catch(_){return null}
  }
  function fits(p,core){
    const ing=core.balance(p),all=[...ing.b,...ing.s,...ing.d];
    if(all.some(i=>!Number.isFinite(i[1])||!Number.isFinite(i[2])||Math.max(i[1],i[2])>((core.F[i[0]].u==='adet'||core.F[i[0]].u==='ölçek')?10:600)))return false;
    return [['s',1],['r',2]].every(([k,pi])=>{const m=core.mac(all,pi),t=core.T[k];return m[0]>=t.lo&&m[0]<=t.hi&&m[1]>=t.pmin});
  }
  function plan(core,hist,candidates,now=new Date()){
    const prev=hist.at(-1),previous=new Set(prev?prev.plans.map(p=>p.d):[]),usedSources=new Set(hist.flatMap(w=>w.plans.map(p=>core.ALL[p.d]?.source?.id).filter(Boolean)));
    const dislikedSources=new Set(Object.keys(core.PREFS).filter(id=>core.PREFS[id]===-1).map(id=>core.ALL[id]?.source?.id).filter(Boolean));
    const knownSources=new Set(Object.values(core.ALL).map(r=>r.source?.id).filter(Boolean));
    const fresh=candidates.filter(r=>!core.ALL[r.id]&&!knownSources.has(r.source.id)&&!usedSources.has(r.source.id)&&!dislikedSources.has(r.source.id)&&core.PREFS[r.id]!==-1).slice(0,12),temporary=[];
    try{
      fresh.forEach(r=>{core.addCustom(r);temporary.push(r)});
      const rank=pool=>pool.filter(r=>core.PREFS[r.id]!==-1).map(r=>({r,score:(core.PREFS[r.id]===1?3:0)+(hist.some(w=>w.plans.some(p=>[p.b,p.s,p.d].includes(r.id)))?0:2)+Math.random()})).sort((a,b)=>b.score-a.score).map(x=>x.r);
      for(let attempt=0;attempt<8;attempt++){
      const w=core.generate(hist,undefined,now),plans=[],usedB=new Set(),usedS=new Set(),usedD=new Set(),usedOrigins=new Set(),selected=[];
      for(let i=0;i<4;i++){
        const types=new Set(plans.map(p=>core.ALL[p.d].pt)),ordinary=rank(core.D).filter(r=>!temporary.includes(r));
        const pool=i===3?[...(selected.length<2?fresh.filter(r=>r.kind==='z'):[]),...rank(core.Z).filter(r=>!temporary.includes(r))]:[...(i<2?fresh.filter(r=>r.kind==='d'&&!types.has(r.pt)):[]),...ordinary.filter(r=>!types.has(r.pt)),...ordinary.filter(r=>types.has(r.pt))];let found=null;
        for(const d of pool){
          if(usedD.has(d.id)||previous.has(d.id)||d.source?.id&&usedOrigins.has(d.source.id))continue;
          pair:for(const b of rank(core.B).filter(x=>!usedB.has(x.id)))for(const s of rank(core.S).filter(x=>!usedS.has(x.id))){
            if(core.clash(b,s))continue;
            const p={b:b.id,s:s.id,d:d.id,...(w.plans[i].days?{days:w.plans[i].days}:{} )};
            if(core.grainOf(d)&&i<3&&(!d.source?.auto||d.steps.some(s=>/^(Bulguru|Pirinci|Karabuğdayı) /.test(s))))p.g=w.plans[i].g||Object.keys(core.GR)[i%Object.keys(core.GR).length];
            if(fits(p,core)){found=p;break pair}
          }
          if(found)break;
        }
        if(!found)break;
        plans.push(found);usedB.add(found.b);usedS.add(found.s);usedD.add(found.d);if(core.ALL[found.d].source?.id)usedOrigins.add(core.ALL[found.d].source.id);const r=fresh.find(r=>r.id===found.d);if(r)selected.push(r);
      }
      if(plans.length===4){w.plans=plans;return {week:w,recipes:selected}}
      }
      return {error:'İkinizin hedeflerine uyan tam bir hafta bulunamadı. Mevcut plan korunuyor.'};
    }finally{temporary.forEach(r=>{for(const pool of [core.B,core.S,core.D,core.Z]){const i=pool.indexOf(r);if(i>=0)pool.splice(i,1)}delete core.ALL[r.id]})}
  }
  const api={ingredient,adapt,projection,proof,read,fits,plan};if(typeof module!=='undefined')module.exports=api;else root.AutoRecipes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
