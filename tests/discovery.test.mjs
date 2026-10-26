import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedURL,robotsAllows,extractRecipe} from '../scripts/discover-recipes.mjs';
test('source fetching only permits canonical HTTPS recipe/sitemap URLs',()=>{
  assert(allowedURL('https://yemek.com/tarif/tavuk-sote/'));
  for(const u of ['http://yemek.com/tarif/test/','https://yemek.com.evil/tarif/test/','http://127.0.0.1/','https://yemek.com/tarif/test/?redirect=http://localhost','https://evil@yemek.com/tarif/test/','https://yemek.com/admin/'])assert(!allowedURL(u),u);
});
test('source robots disallow rules are respected, including more specific allow rules',()=>{
  const r='User-agent: *\nDisallow: /tarif/\nAllow: /tarif/allowed/\nUser-agent: Other\nAllow: /';
  assert(!robotsAllows(r,'https://yemek.com/tarif/test/'));assert(robotsAllows(r,'https://yemek.com/tarif/allowed/'));assert(!robotsAllows('User-agent: *\nDisallow: /','https://yemek.com/tarif/test/'));
});
test('JSON-LD extraction supports graph/section formats and never executes source scripts',()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':['Thing','Recipe'],name:'Örnek &amp; yemek',recipeYield:'2 kişilik',recipeIngredient:['300 gram tavuk göğsü'],recipeInstructions:[{'@type':'HowToSection',itemListElement:[{text:'Tavada pişirin.'}]}]}]})+'</script><script>throw Error("untrusted")</script>';
  const r=extractRecipe(html);assert.equal(r.name,'Örnek & yemek');assert.deepEqual(r.steps,['Tavada pişirin.']);assert.equal(extractRecipe('<html>no recipe</html>'),null);
});
