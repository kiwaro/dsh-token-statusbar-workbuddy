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
  assert.equal(find(low,'tsb-rateHeading').children[1].children[0],'×0.11');
  assert.equal(find(low,'tsb-rateValueLabel').props.style,undefined);
});
test('model-row periods follow each model price structure',()=>{
  const a=source.indexOf('function modelHasPeriodPricing('),b=source.indexOf('\n    }',a)+6;
  const ctx=vm.createContext({OFFICIAL_PRICES:{'glm-5.3-flash':{flat:{input:.8,cacheHit:.23,output:2.8}},'deepseek-v4.1-flash':{peak:{input:2,cacheHit:.04,output:8},off:{input:1,cacheHit:.02,output:4}}}});
  vm.runInContext(source.slice(a,b),ctx);
  assert.equal(ctx.modelHasPeriodPricing('glm-5.3-flash'),false);
  assert.equal(ctx.modelHasPeriodPricing('deepseek-v4.1-flash'),true);
  const start=source.indexOf('      const creditModelRow ='),end=source.indexOf('      const tips =',start);
  Object.assign(ctx,{T:k=>k,fmtTokens:String,fmtCredit:n=>n.toFixed(2),modelLabel:x=>x,palette:['blue'],locale:'zh'});
  vm.runInContext(source.slice(start,end)+'\nbuild=(splits)=>splits.map((cost,index)=>creditModelRow(cost,"1.00",index,palette));',ctx);
  const trae=ctx.build([{model:'trae/deepseek-v4.1-flash',tokens:100,offTokens:100,cny:1}])[0];
  assert.equal(trae.unitPrice,'1000000.00'); assert(trae.periodText.includes('split.off')); assert.equal(trae.tokens,'100');
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
test('credit cards separate session today from session totals and reuse model lists',()=>{
 const start=source.indexOf('      const sessionCreditSection = {');
 const end=source.indexOf('      // Assemble the combined card.',start);
 const ctx=vm.createContext({creditModelRow:(cost,credits)=>({credits}),tips:{credits:{modelHeadTotal:'9.00',modelRows:[{label:'m',credits:'9.00'}]}},T:k=>k,billing:{get:()=>({bySession:{current:{coverage:{turns:{2:{total:3,models:{m:{credits:3,count:1}}}},todayModels:{m:{credits:2,count:1}}}},other:{coverage:{todayModels:{m:{credits:90,count:1}}}}}})},latest:{turn:2},sessionId:'current',sessionToday:2,balTotal:140.61,TOKEN_COLORS:{},modelLabel:x=>x,fmtCredit:n=>n.toFixed(2)});
 vm.runInContext(source.slice(start,end)+'\nresult={today:tips.credits,session:sessionCreditSection,turn:turnCreditSection};',ctx);
 assert.equal(ctx.result.turn.head,'chart.turnCredits');
 assert.equal(ctx.result.turn.speed,'3.00');
 assert.equal(ctx.result.turn.modelRows[0].credits,'3.00');
 assert.equal(ctx.result.turn.rows.length,0);
 assert.equal(ctx.result.today.modelHeadTotal,'2.00');
 assert.equal(ctx.result.today.modelRows[0].credits,'2.00');
 assert.equal(ctx.result.today.rows.length,0);
 assert.equal(ctx.result.session.speed,'9.00');
 assert.equal(ctx.result.session.head,'chart.creditStatistics');
 assert.equal(ctx.result.session.rows[0][0],'tip.balance');
 assert.equal(ctx.result.session.rows[0][1],'140.61');
 assert.equal(ctx.result.session.modelRows[0].credits,'9.00');
 assert(source.includes('tips.session.sections = [sectionOf(tips.session), sessionCreditSection]'));
});
test('credit chip follows session today and scope selector is removed',()=>{
 const a=source.indexOf('    const creditChipFor = (T2) => {'),b=source.indexOf('    // ---- session totals:',a);
 for(const [today,want] of [[0,'0.00'],[100,'100.00'],[null,'—']]) {
  const ctx=vm.createContext({creditPendingToday:false,sessionToday:today,balTotal:553.85,bal:{},fmtCredit:n=>n.toFixed(2)});
  vm.runInContext(source.slice(a,b)+'\nresult=creditChipFor(x=>x);',ctx);
  assert.equal(ctx.result.head,want);assert.equal(ctx.result.scope,'sessionToday');
 }
 assert(!source.includes('tsb-credit-scope'));
});

test('renamed preferences read old values, prioritize new values and save under new name',()=>{
 const start=source.indexOf('    function readPrefs()');const end=source.indexOf('    // ---- components',start);
 const values=new Map();const writes=[];
 const context=vm.createContext({PREFS_KEY:'new',LEGACY_PREFS_KEY:'old',DEFAULT_PREFS:{speed:true},isCreditScope:v=>['session','today','balance'].includes(v),window:{localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>writes.push([k,v])}}});
 vm.runInContext(source.slice(start,end),context);
 values.set('old',JSON.stringify({speed:false,creditScope:'today'}));assert.equal(context.readPrefs().creditScope,undefined);assert.equal(context.readPrefs().speed,false);
 values.set('new',JSON.stringify({speed:true,creditScope:'balance'}));assert.equal(context.readPrefs().creditScope,undefined);
 values.delete('new');values.set('old','invalid');assert.equal(context.readPrefs().creditScope,undefined);
 context.writePrefs({speed:false,creditScope:'today'});assert.equal(writes[0][0],'new');assert.equal(values.get('old'),'invalid');
});


test('Trae pending usage remains visible in the credit chip and shared rows',()=>{
 const a=source.indexOf('    const creditChipFor = (T2) => {'),b=source.indexOf('    // ---- session totals:',a);
 const ctx=vm.createContext({creditPendingToday:true,sessionToday:0,fmtCredit:n=>n.toFixed(2)});
 vm.runInContext(source.slice(a,b)+'\nresult=creditChipFor(x=>x);',ctx);
 assert.equal(ctx.result.head,'credit.pending');
 assert(source.includes("params.push('provider=' + encodeURIComponent(BILLING_PROVIDER))"));
 assert(source.includes('if (requestedProvider !== BILLING_PROVIDER)'));
 assert(source.includes("actual.unresolved ? T('credit.pending')"));
});

test('Trae missing credit copy describes data availability',()=>{ assert(!source.includes('待核实')); assert(source.includes('逐响应积分明细暂缺')); });
