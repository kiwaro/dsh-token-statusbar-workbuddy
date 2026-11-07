import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal, summarizeSession, estimateCredit, actualInWindow } from '../lib/accounting.js';

const event = (id, model='deepseek-v4.1-flash', time=100, usage={inputTokens:1000, outputTokens:10}) => JSON.stringify({type:'assistant/message',time,data:{usage,message:{source:{replayState:{response:{provider:'workbuddy',model,responseId:id}}}}}});
const quote = () => 0.07;
test('rotation, deduplication, actual precedence, model/session totals', () => {
  const records=parseJournal([JSON.stringify({r:'A',c:1,a:'account-A',t:100}),JSON.stringify({r:'B',c:2,a:'account-B',t:101}),JSON.stringify({r:'A',c:1,a:'account-A',t:100})].join('\n'));
  const result=summarizeSession([event('A'),event('B','glm-5.3-flash'),event('C'),event('A')].join('\n'),records,null,quote);
  assert.equal(result.expected,3); assert.equal(result.matched,2); assert.equal(result.actual,3);
  assert.equal(result.estimated,1); assert.equal(result.displayTotal,4);
  assert.equal(Object.values(result.models).reduce((sum,row)=>sum+row.displayCredits,0),4);
  assert.equal(actualInWindow(records,0,200).total,3);
});
test('inheritance, malformed records, zero credits, unsupported models', () => {
  const records=parseJournal('{bad\n'+JSON.stringify({r:'zero',c:0,t:100})+'\n'+JSON.stringify({r:'bad',c:-1,t:100}));
  const result=summarizeSession([event('ancestor','deepseek-v4.1-flash',1),event('zero'),event('missing','unknown')].join('\n'),records,50,quote);
  assert.equal(result.expected,2); assert.equal(result.matched,1); assert.equal(result.actual,0); assert.equal(result.unresolved,1);
  assert.equal(records.has('bad'),false);
});
test('latest event supplies final usage; actual arriving later replaces estimate', () => {
  const text=[event('A','deepseek-v4.1-flash',100,{inputTokens:1,outputTokens:1}),event('A','deepseek-v4.1-flash',101,{inputTokens:2,outputTokens:10})].join('\n');
  const first=summarizeSession(text,new Map(),null,(m,u)=>u.outputTokens*0.007);
  assert.equal(first.expected,1); assert.equal(first.estimated,1);
  const second=summarizeSession(text,parseJournal(JSON.stringify({r:'A',c:0.9,t:110})),null,quote);
  assert.equal(second.actual,0.9); assert.equal(second.estimated,0); assert.equal(second.displayTotal,0.9);
});
test('historical estimates remain estimates and reject uncalibrated write usage', () => {
  assert.equal(estimateCredit('deepseek-v4.1-flash',{inputTokens:1,outputTokens:1},1,quote).credits,1);
  assert.equal(estimateCredit('deepseek-v4.1-flash',{inputTokens:1,outputTokens:1,cacheWriteTokens:1},1,quote),null);
  assert.equal(estimateCredit('unknown',{inputTokens:1,outputTokens:1},1,quote),null);
});

test('session today follows Beijing midnight and excludes other sessions', () => {
  const now=Date.UTC(2026,10,2,2), midnight=Date.UTC(2026,10,1,16);
  const records=parseJournal([
    {r:'yesterday',c:10,t:midnight-1},
    {r:'today',c:2,t:midnight},
    {r:'other-session',c:99,t:midnight},
  ].map(JSON.stringify).join('\n'));
  const summary=summarizeSession([
    event('yesterday','deepseek-v4.1-flash',midnight-1),
    event('today','deepseek-v4.1-flash',midnight),
    event('estimated','deepseek-v4.1-flash',midnight+1),
  ].join('\n'),records,null,quote,now);
  assert.equal(summary.todayModels['deepseek-v4.1-flash'].credits,3);
  assert.equal(summary.todayModels['deepseek-v4.1-flash'].count,2);
  assert.equal(summary.todayActual,2);
  assert.equal(summary.todayEstimated,1);
  assert.equal(summary.todayTotal,3);
  assert.equal(summary.displayTotal,13);
});

test('turn credits deduplicate responses and replace estimates within each turn', () => {
 const e=(id,turn)=>{const value=JSON.parse(event(id));value.data.turn=turn;return JSON.stringify(value);};
 const text=[e('old',1),e('a',2),e('a',2),e('b',2)].join('\n');
 const records=parseJournal([{r:'old',c:90,t:100},{r:'a',c:2,t:100}].map(JSON.stringify).join('\n'));
 const first=summarizeSession(text,records,null,quote);
 assert.equal(first.turns[1].total,90);
 assert.equal(first.turns[2].total,3);
 assert.equal(first.turns[2].models['deepseek-v4.1-flash'].count,2);
 assert.equal(first.turns[2].models['deepseek-v4.1-flash'].tokens,2020);
 assert.equal(first.turns[2].models['deepseek-v4.1-flash'].offTokens,2020);
 assert.equal(first.turns[2].models['deepseek-v4.1-flash'].cny,0.14);
 records.set('b',{r:'b',c:4,t:101});
 assert.equal(summarizeSession(text,records,null,quote).turns[2].total,6);
});


test('Trae regions survive switching, share no response keys and retain four token buckets', () => {
  const make=(provider,id='same',turn=2,step=1)=>JSON.stringify({type:'assistant/message',time:100,data:{turn,step,usage:{inputTokens:10,cacheReadTokens:20,cacheWriteTokens:30,outputTokens:40},message:{source:{provider,model:'deepseek-v4.1-flash',replayState:{response:{provider,model:'deepseek-v4.1-flash',...(id ? {responseId:id} : {})}}}}}});
  const records=parseJournal(JSON.stringify({r:'same',c:7,t:100,a:'workbuddy-account'}));
  const text=[make('workbuddy'),make('trae'),make('trae'),make('trae-enterprise'),make('trae-global',null)].join('\n');
  const result=summarizeSession(text,records,null,quote,200);
  assert.equal(result.expected,4); assert.equal(result.matched,1); assert.equal(result.actual,7);
  assert.equal(result.estimated,0); assert.equal(result.unresolved,3);
  for(const provider of ['trae','trae-enterprise','trae-global']) {
    const key=provider+'/deepseek-v4.1-flash';
    assert.equal(result.models[key].tokens,100);
    assert.equal(result.todayModels[key].unresolved,1);
    assert.equal(result.turns[2].models[key].tokens,100);
  }
  records.set('trae/same',{r:'trae/same',c:2,t:110,a:'trae-account'});
  const corrected=summarizeSession(text,records,null,quote,200);
  assert.equal(corrected.actual,9); assert.equal(corrected.unresolved,2);
  assert.equal(corrected.todayModels['trae/deepseek-v4.1-flash'].credits,2);
  assert.equal(summarizeSession(text,records,150,quote,200).expected,0);
});


test('all channels reuse the existing model calculation and actual replacement',()=>{
 const usage={inputTokens:1000,cacheReadTokens:500,cacheWriteTokens:0,outputTokens:20};
 for(const provider of ['workbuddy','trae','trae-enterprise','trae-global']) {
   const e=JSON.parse(event('shared','deepseek-v4.1-flash',100,usage));e.data.turn=1;e.data.message.source.replayState.response.provider=provider;
   const text=JSON.stringify(e);const first=summarizeSession(text,new Map(),null,quote,200);
   assert.equal(first.displayTotal,1);assert.equal(first.todayTotal,1);assert.equal(first.turns[1].total,1);
   assert.equal(first.unresolved,0);
   const key=provider==='workbuddy'?'shared':provider+'/shared';
   const second=summarizeSession(text,new Map([[key,{r:key,c:2,t:110,a:'rotated'}]]),null,quote,200);
   assert.equal(second.displayTotal,2);assert.equal(second.estimated,0);assert.equal(second.turns[1].total,2);
 }
});
