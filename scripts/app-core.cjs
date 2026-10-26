const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
module.exports=function loadCore(file=path.join(__dirname,'../index.html')){
  const html=fs.readFileSync(file,'utf8');
  const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context=vm.createContext({module:{exports:{}},console});
  vm.runInContext(js,context);
  return {core:context.module.exports,js,context};
};
