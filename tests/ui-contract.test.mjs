import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
test('rate chart keeps one standard boundary and colors the excess',()=>{
  const a=source.indexOf("      if (chart.type === 'rate') {"),b=source.indexOf("      if (chart.type === 'status') {",a);
  const make=vm.runInNewContext('(chart)=>{'+source.slice(a,b)+'}',{h:(tag,props,...children)=>({tag,props:props||{},children})});
  const find=(tree,name)=>tree.props?.className?.split(' ').includes(name)?tree:tree.children?.filter(Boolean).map(c=>typeof c==='object'?find(c,name):null).find(Boolean);
  const low=make({type:'rate',value:.11,valueLabel:'×0.11',standardLabel:'标准 ×1'});
  const high=make({type:'rate',value:1.62,valueLabel:'×1.62',standardLabel:'标准 ×1'});
  assert.equal(find(low,'tsb-rateBaseline').props.style.left,'100%');
  assert.equal(find(high,'tsb-rateBaseline').props.style.left,'100%');
  assert.equal(find(low,'tsb-rateFill').props.style.width,'11%');
  assert.equal(find(high,'tsb-rateFill').props.style.width,'100%');
  assert.equal(find(low,'tsb-rateExcess'),undefined);
  assert(Math.abs(parseFloat(find(high,'tsb-rateExcess').props.style.width)-62)<1e-9);
  assert.equal(find(high,'tsb-rateOverLabel').children[0],'+62%');
  assert.equal(find(high,'tsb-rateValueLabel').children[0],'×1.62');
  assert.equal(find(low,'tsb-rateValueLabel').props.style.left,find(low,'tsb-rateCurrent').props.style.left);
});
test('model-row periods follow each model price structure',()=>{
  const a=source.indexOf('function modelHasPeriodPricing('),b=source.indexOf('\n    }',a)+6;
  const ctx=vm.createContext({OFFICIAL_PRICES:{'glm-5.3-flash':{flat:{input:.8,cacheHit:.23,output:2.8}},'deepseek-v4.1-flash':{peak:{input:2,cacheHit:.04,output:8},off:{input:1,cacheHit:.02,output:4}}}});
  vm.runInContext(source.slice(a,b),ctx);
  assert.equal(ctx.modelHasPeriodPricing('glm-5.3-flash'),false);
  assert.equal(ctx.modelHasPeriodPricing('deepseek-v4.1-flash'),true);
  const start=source.indexOf('return splits.map((cost, index) => {'),end=source.indexOf('\n              }\n              const rows',start);
  Object.assign(ctx,{T:k=>k,fmtTokens:String,fmtCredit:n=>n.toFixed(2),modelLabel:x=>x,palette:['blue'],locale:'zh'});
  vm.runInContext('build=(splits,models)=>{'+source.slice(start,end)+'}',ctx);
  const rows=ctx.build([{model:'glm-5.3-flash',tokens:100,offTokens:100,cny:1},{model:'deepseek-v4.1-flash',tokens:100,offTokens:100,cny:1}],{});
  assert.equal(rows[0].periodText,null);
  assert.equal(rows[0].tokens,'100');
  assert(rows[1].periodText.includes('split.off'));
});
test('session-today value crosses the derived-data and component boundary',()=>{
  const returnStart=source.indexOf('      return {\n        facts, promoBadge');
  const returnEnd=source.indexOf('\n      };',returnStart);
  assert(returnStart>=0);
  assert(/\bsessionToday\b/.test(source.slice(returnStart,returnEnd)));
  const inputStart=source.indexOf('      const {\n        facts, promoBadge');
  const inputEnd=source.indexOf('      } = derived;',inputStart);
  assert(inputStart>=0);
  assert(/\bsessionToday\b/.test(source.slice(inputStart,inputEnd)));
});
test('first group contains exactly the original two rows',()=>{
  const a=source.indexOf('          rows: [',source.lastIndexOf('        credits: {'));
  const b=source.indexOf('            modelRows:',a);
  const rows=source.slice(a,b);
  assert.equal((rows.match(/\[T\(/g)||[]).length,2);
  assert(rows.includes("T('chart.todayCredits')")); assert(rows.includes("T('tip.balance')"));
  assert(!rows.includes('estimatedCount')); assert(!source.includes('（含估算）')); assert(!source.includes('（估）'));
});
test('all three scopes stay isolated including session zero',()=>{
  const a=source.indexOf('    const creditChipFor = (T2) => {'),b=source.indexOf('    // ---- session totals:',a);
  for(const [scope,value,want] of [['session',0,'0.00'],['session',null,'—'],['today',0,'35.23'],['balance',0,'100.00']]) {
    const ctx=vm.createContext({prefs:{creditScope:scope},isCreditScope:()=>true,creditSession:value,creditToday:35.23,balTotal:100,bal:{},fmtCredit:n=>n.toFixed(2)});
    vm.runInContext(source.slice(a,b)+'\nresult=creditChipFor(x=>x);',ctx);
    assert.equal(ctx.result.head,want); assert.equal(ctx.result.scope,scope);
  }
});

test('renamed preferences read old values, prioritize new values and save under new name',()=>{
 const start=source.indexOf('    function readPrefs()');const end=source.indexOf('    // ---- components',start);
 const values=new Map();const writes=[];
 const context=vm.createContext({PREFS_KEY:'new',LEGACY_PREFS_KEY:'old',DEFAULT_PREFS:{speed:true,creditScope:'session'},isCreditScope:v=>['session','today','balance'].includes(v),window:{localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>writes.push([k,v])}}});
 vm.runInContext(source.slice(start,end),context);
 values.set('old',JSON.stringify({speed:false,creditScope:'today'}));assert.equal(context.readPrefs().creditScope,'today');assert.equal(context.readPrefs().speed,false);
 values.set('new',JSON.stringify({speed:true,creditScope:'balance'}));assert.equal(context.readPrefs().creditScope,'balance');
 values.delete('new');values.set('old','invalid');assert.equal(context.readPrefs().creditScope,'session');
 context.writePrefs({speed:false,creditScope:'today'});assert.equal(writes[0][0],'new');assert.equal(values.get('old'),'invalid');
});
