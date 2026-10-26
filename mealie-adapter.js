/* Mealie → editör. Kaynak kalorileri hesap tablosuna karıştırılmaz. */
(function(root){
  'use strict';
  const norm=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').trim();
  const aliases={chicken:'tavuk','chicken breast':'tavuk',egg:'yumurta',eggs:'yumurta','olive oil':'zyag',bulgur:'bulgur',oats:'yulaf',tomato:'domates',cucumber:'salatalik'};
  function foodKey(name,foods){
    const n=norm(name),exact=Object.keys(foods).find(k=>norm(k)===n||norm(foods[k].n)===n);
    return exact||aliases[n]&&Object.hasOwn(foods,aliases[n])&&aliases[n]||'';
  }
  function snapshot(recipe,foods,kind){
    const r=JSON.parse(JSON.stringify({...recipe,kind,two:kind==='d'}));
    return {schema:1,recipe:r,foods:Object.fromEntries(r.ing.map(i=>[i[0],{u:foods[i[0]].u||'g',m:foods[i[0]].m}]))};
  }
  function readSnapshot(source,foods){
    try{
      const raw=source.extras&&source.extras.beslenme_v1,s=typeof raw==='string'?JSON.parse(raw):raw;
      if(!s||s.schema!==1||!s.recipe||!Array.isArray(s.recipe.ing)||s.recipe.ing.length>30)return null;
      if(!s.recipe.ing.every(i=>Array.isArray(i)&&Object.hasOwn(foods,i[0])&&s.foods?.[i[0]]&&JSON.stringify(s.foods[i[0]])===JSON.stringify({u:foods[i[0]].u||'g',m:foods[i[0]].m})&&Number.isFinite(i[1])&&Number.isFinite(i[2])&&i[1]>=0&&i[2]>=0&&(i[1]>0||i[2]>0)))return null;
      // If the recipe was edited in Mealie, stale extras must not override the visible recipe.
      if(source.name!==undefined&&source.name!==s.recipe.name)return null;
      if(source.recipeInstructions!==undefined&&JSON.stringify(source.recipeInstructions.map(x=>x?.text))!==JSON.stringify(s.recipe.steps))return null;
      if(source.recipeIngredient!==undefined&&(source.recipeIngredient.length!==s.recipe.ing.length||!source.recipeIngredient.every((x,j)=>{
        const i=s.recipe.ing[j],f=foods[i[0]],note=f.n+' — Samet '+i[1]+' '+(f.u||'g')+', Raşe '+i[2]+' '+(f.u||'g')+(i[3]?' • her gün taze':'');
        return x&&x.quantity===i[1]&&!x.unit&&!x.food&&x.note===note;
      })))return null;
      return s;
    }catch(_){return null}
  }
  function draft(source,foods){
    const snap=readSnapshot(source,foods),r=snap&&snap.recipe;
    if(r)return {kind:r.kind,name:r.name,pt:r.pt||'tavuk',rows:r.ing.map(i=>({k:i[0],s:i[1],r:i[2],serve:!!i[3],rAuto:false,confirmed:true,original:foods[i[0]].n})),steps:(r.steps||[]).join('\n'),spice:(r.spice||[]).join(', '),notes:['Türkçe tarif ve iki kişinin miktarları besin tablosuyla birebir doğrulandı.'],source:{id:source.id,name:source.name,slug:source.slug},snapshot:true};
    const servings=Number(source.recipeServings),validServings=Number.isFinite(servings)&&servings>0;
    const rows=(source.recipeIngredient||[]).map(input=>{
      const i=input&&typeof input==='object'?input:{};
      const name=i.food?.name||'',k=foodKey(name,foods),unit=norm(i.unit?.abbreviation||i.unit?.name||''),q=Number(i.quantity);
      const gram=unit==='g'||unit==='gram'||unit==='grams',kg=unit==='kg'||unit==='kilogram';
      // Adet/ölçek, hacim ve pişmiş/çiğ dönüşümü otomatik tahmin edilmez.
      const safe=validServings&&k&&(foods[k].u||'g')==='g'&&(gram||kg)&&Number.isFinite(q)&&q>0;
      const amount=safe?Math.round(q*(kg?1000:1)/servings*100)/100:'';
      return {k,s:amount,r:amount,serve:false,rAuto:false,confirmed:false,original:String(i.display||i.originalText||[i.quantity,i.unit?.name,name,i.note].filter(Boolean).join(' ')).slice(0,1000)};
    });
    return {kind:'d',name:String(source.name||'').slice(0,90),pt:'tavuk',rows:rows.length?rows:[{k:'',s:'',r:'',confirmed:false,original:'Kaynakta malzeme bulunamadı'}],steps:(source.recipeInstructions||[]).map(x=>typeof x?.text==='string'?x.text:'').join('\n'),spice:'',notes:['Kaynak dili korunur. İsterseniz adı ve hazırlanışı Türkçeleştirin.','Her malzemeyi, çiğ/pişmiş durumunu, birimini ve iki kişinin miktarını kontrol edip onaylayın. Kaynak kalorileri yerine bu uygulamanın besin tablosu kullanılır.',...(!validServings?['Kaynağın porsiyon sayısı belirsiz; miktarları elle girin.']:[])],source:{id:source.id,name:source.name,slug:source.slug},snapshot:false};
  }
  const reviewed=e=>!e.source||e.rows.length>0&&e.rows.every(x=>x.confirmed&&x.k&&Number.isFinite(+x.s)&&+x.s>0&&Number.isFinite(+x.r)&&+x.r>0);
  const api={foodKey,snapshot,readSnapshot,draft,reviewed};
  if(typeof module!=='undefined')module.exports=api;else root.MealieAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this);
