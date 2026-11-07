import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';

test('complete host flow: four buckets, currency, current session, global today, cache and restart', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-accounting-test-'));
  process.env.DSH_HOME=path.join(root,'.dsh'); process.env.USERPROFILE=root; process.env.HOME=root;
  assert.equal(os.homedir(),root,'test must use isolated storage');
  const at=Date.now()-10000;
  const store=path.join(root,'.dsh','storages','dsh-connect-workbuddy'); fs.mkdirSync(store,{recursive:true});
  fs.writeFileSync(path.join(store,'response-credits.jsonl'),[{r:'A',c:1.25,a:'first',t:at},{r:'B',c:2.5,a:'second',t:at},{r:'unopened',c:3,a:'third',t:at}].map(JSON.stringify).join('\n'));
  for(const [id,r] of [['session-A','A'],['session-B','B']]) {
    const dir=path.join(root,'.dsh','sessions','workspace',id); fs.mkdirSync(dir,{recursive:true});
    const e={type:'assistant/message',time:at,data:{usage:{inputTokens:1000,cacheReadTokens:1000,cacheWriteTokens:0,outputTokens:100},message:{source:{model:'deepseek-v4.1-flash',replayState:{response:{provider:'workbuddy',model:'deepseek-v4.1-flash',responseId:r}}}}}};
    fs.writeFileSync(path.join(dir,'session.v4.jsonl.zstd'),zlib.zstdCompressSync(Buffer.from(JSON.stringify(e)+'\n')));
  }
  const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'signed-in',credits:{total:100},models:[]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const host=await import('../lib/index.js'); const base='http://127.0.0.1:'+server.address().port;
    const A=await host.buildBilling(base,{sessions:'session-A,session-B',fresh:'1'});
    assert.equal(A.credits.session,1.25); assert.equal(A.bySession['session-B'].displayTotal,2.5);
    assert.equal(A.bySession['session-A'].sessionToday,1.25);
    assert.equal(A.bySession['session-B'].sessionToday,2.5);
    assert.equal(A.credits.today,6.75,'unopened response belongs to global actual total');
    const B=await host.buildBilling(base,{sessions:'session-B,session-A',fresh:'1'});
    assert.equal(B.credits.session,2.5);
    const cache=host.__test.readPayloadCache({sessions:['session-A','session-B'],account:'0'},Date.now());
    assert.equal(cache.credits.session,1.25);
    const restarted=await import('../lib/index.js?restart=1');
    const after=await restarted.buildBilling(base,{sessionId:'session-A',fresh:'1'});
    assert.equal(after.credits.displayTotal,1.25);
    const peak=Date.UTC(2026,10,2,1),off=Date.UTC(2026,10,2,0);
    for(const [key,expected] of [['inputTokens',1],['cacheReadTokens',0.02],['cacheWriteTokens',1],['outputTokens',4]]) {
      const u={inputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:0,[key]:1e6};
      assert.equal(host.__test.quoteUsage('deepseek-v4.1-flash',u,off),expected);
      assert.equal(host.__test.quoteUsage('deepseek-v4.1-flash',u,peak),expected*2);
    }
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('reconciliation uses latest journal corrections and account ownership', async () => {
 const {__test}=await import('../lib/index.js');
 const {parseJournal}=await import('../lib/accounting.js');
 const records=parseJournal([{r:'x',a:'a',c:1,t:11},{r:'x',a:'b',c:3,t:12},{r:'y',a:'a',c:2,t:13}].map(JSON.stringify).join('\n'));
 const result=__test.reconcileAccounts([{id:'a',credits:8},{id:'b',credits:7}],{accounts:{a:{balance:10,at:10},b:{balance:10,at:10}}},records,20);
 assert.equal(result.accounts.a.observedCredit,2);
 assert.equal(result.accounts.b.observedCredit,3);
 assert.equal(result.accounts.a.difference,0);
 assert.equal(result.accounts.b.difference,0);
});

test('reconciliation logs rotate within bounds and diagnostics omit private text', async () => {
 const {__test}=await import('../lib/index.js');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-log-test-'));
 const file=path.join(root,'log.jsonl');
 for(let i=0;i<12;i++) __test.appendReconciliationLog(file,{i,padding:'x'.repeat(15)},80);
 for(const name of fs.readdirSync(root)) assert.ok(fs.statSync(path.join(root,name)).size<=80);
 assert.ok(fs.readdirSync(root).length<=3);
 assert.equal(JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').at(-1)).i,11);
 const messages=[]; const warn=console.warn;
 try {console.warn=value=>messages.push(value); __test.reportDiagnostic('synthetic-test',{code:'EACCES',message:'private-path-secret'}); __test.reportDiagnostic('synthetic-test',{code:'EACCES'});} finally {console.warn=warn;}
 assert.equal(messages.length,1); assert.ok(!messages[0].includes('private-path-secret'));
});

test('corrections across sampling windows reconcile the signed change', async () => {
 const {reconcileAccounts}=await import('../lib/reconciliation.js');
 const {parseJournal}=await import('../lib/accounting.js');
 const before=reconcileAccounts([{id:'a',credits:10}],{accounts:{}},parseJournal('{"r":"x","a":"a","c":2,"t":5}'),10);
 const after=reconcileAccounts([{id:'a',credits:9}],before,parseJournal('{"r":"x","a":"a","c":3,"t":15}'),20);
 assert.equal(after.accounts.a.observedCredit,1);
 assert.equal(after.accounts.a.difference,0);
 const refund=reconcileAccounts([{id:'a',credits:11}],after,parseJournal('{"r":"x","a":"a","c":1,"t":25}'),30);
 assert.equal(refund.accounts.a.observedCredit,-2);
 assert.equal(refund.accounts.a.difference,0);
});

test('pricing calendar handles holiday, adjusted workday and minute boundaries', async () => {
 const {isPeakInstant}=await import('../lib/pricing.js');
 const holiday={'2026-10-01':'off'}, adjusted={'2026-10-10':'weekday'};
 const at=(d,h,m=0)=>Date.UTC(2026,9,d,h-8,m);
 assert.equal(isPeakInstant(at(1,10),holiday),false);
 for(const [h,m,expected] of [[8,59,false],[9,0,true],[12,0,false],[14,0,true],[18,0,false]]) assert.equal(isPeakInstant(at(10,h,m),adjusted),expected);
 assert.equal(isPeakInstant(at(10,10),{}),false);
});

test('sampler reports HTTP and response format failures using synthetic bridge', async () => {
 const {startBalanceSampler}=await import('../lib/reconciliation.js');
 const originalFetch=globalThis.fetch, warn=console.warn;
 const messages=[];
 let calls=0, finish;
 const completed=new Promise(resolve=>{finish=resolve;});
 console.warn=value=>messages.push(value);
 globalThis.fetch=async()=>{
  calls++;
  if(calls===2) finish();
  return calls===1 ? {ok:false,status:503} : {ok:true,json:async()=>({unexpected:'synthetic'})};
 };
 let stop;
 try {
  stop=startBalanceSampler(60000,()=> 'http://synthetic.invalid',()=> {throw new Error('accounts unavailable');});
  await completed;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);
  assert.ok(messages.some(value=>value.includes('HTTP503')));
  assert.ok(messages.some(value=>value.includes('EFORMAT')));
 } finally {stop?.(); globalThis.fetch=originalFetch;console.warn=warn;}
});

test('calendar configuration validates dates and refreshes after its cache lifetime', async () => {
 const previousHome=process.env.DSH_HOME;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-calendar-test-'));
 process.env.DSH_HOME=root;
 const directory=path.join(root,'storages','dsh-token-statusbar-workbuddy');
 fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'pricing-calendar.json');
 const clock=Date.now, warn=console.warn;
 let now=clock(); const messages=[];
 Date.now=()=>now; console.warn=value=>messages.push(value);
 try {
  const pricing=await import('../lib/pricing.js?calendar-validation');
  fs.writeFileSync(file,JSON.stringify({version:1,source:'synthetic-fixture',days:{'2026-10-01':'off'}}));
  assert.equal(pricing.isPeakInstant(Date.UTC(2026,9,1,2)),false);
  fs.writeFileSync(file,JSON.stringify({version:1,source:'synthetic-fixture',days:{}}));
  now+=1001;
  assert.equal(pricing.isPeakInstant(Date.UTC(2026,9,1,2)),true);
  fs.writeFileSync(file,JSON.stringify({version:1,source:'synthetic-fixture',days:{'2026-02-30':'off'}}));
  now+=1001;
  assert.deepEqual(pricing.readPricingCalendar(),{});
  assert.ok(messages.some(value=>value.includes('ECALENDAR')));
 } finally {Date.now=clock;console.warn=warn; if(previousHome===undefined) delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;}
});


test('Trae provider routes isolate region balances, rates and cache entries', async () => {
 const {buildBilling,__test}=await import('../lib/index.js');
 const routes=[];
 const server=http.createServer((req,res)=>{
   routes.push(req.url);res.setHeader('content-type','application/json');
   const panel=new URL(req.url,'http://local').searchParams.get('region');
   res.end(JSON.stringify({status:'signed-in',credits:panel==='cn'?{total:999,generalAvailable:12}:undefined,models:[{id:'deepseek-v4.1-flash',creditMultiplier:0.5}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
   const base='http://127.0.0.1:'+server.address().port;
   for(const [provider,panel] of [['trae','cn'],['trae-enterprise','enterprise'],['trae-global','ai']]) {
     const result=await buildBilling(base,{provider,fresh:'1'});
     assert.equal(routes.at(-1),'/plugins/dsh-connect-trae/usage?region='+panel);
     assert.equal(result.provider,provider);
     assert.equal(result.balance?.total,panel==='cn'?12:undefined);
     assert.equal(result.models['deepseek-v4.1-flash'].rate,panel==='cn'?0.5:undefined);
   }
   assert.notEqual(__test.payloadKey({provider:'trae'},1),__test.payloadKey({provider:'workbuddy'},1));
 } finally {await new Promise(resolve=>server.close(resolve));}
});


test('sampling transcript reader includes assistant events after the identity zstd frame', async()=>{
 const {__test}=await import('../lib/index.js');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'trae-frames-'));
 const file=path.join(root,'session.v4.jsonl.zstd');
 const first=JSON.stringify({type:'session',createdAt:1})+'\n';
 const second=JSON.stringify({type:'assistant/message',time:2,data:{usage:{inputTokens:100},message:{source:{provider:'trae'}}}})+'\n';
 fs.writeFileSync(file,Buffer.concat([zlib.zstdCompressSync(Buffer.from(first)),zlib.zstdCompressSync(Buffer.from(second))]));
 const events=__test.readTranscript(file).split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(events.length,2);assert.equal(events[1].data.usage.inputTokens,100);
});


test('Trae channel journal replaces shared estimates without crossing WorkBuddy ids',async()=>{
 const {buildBilling}=await import('../lib/index.js');
 const store=path.join(process.env.DSH_HOME,'storages','dsh-connect-trae');fs.mkdirSync(store,{recursive:true});
 const at=Date.now()-1000;fs.writeFileSync(path.join(store,'response-credits.jsonl'),JSON.stringify({r:'same',c:4,t:at,a:'trae-account'})+'\n');
 const dir=path.join(process.env.DSH_HOME,'sessions','workspace','session-trae');fs.mkdirSync(dir,{recursive:true});
 const e={type:'assistant/message',time:at,data:{turn:1,step:1,usage:{inputTokens:100,cacheReadTokens:10,cacheWriteTokens:0,outputTokens:1},message:{source:{replayState:{response:{provider:'trae',model:'deepseek-v4.1-flash',responseId:'same'}}}}}};
 fs.writeFileSync(path.join(dir,'session.v4.jsonl.zstd'),zlib.zstdCompressSync(Buffer.from(JSON.stringify(e)+'\n')));
 const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'signed-in',models:[],credits:{generalAvailable:20}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 const result=await buildBilling('http://127.0.0.1:'+server.address().port,{provider:'trae',sessionId:'session-trae',fresh:'1'});
 assert.equal(result.credits.session,4);assert.equal(result.credits.coverage.estimated,0);assert.equal(result.credits.coverage.turns[1].total,4);
 }finally{await new Promise(r=>server.close(r));}
});


test('Trae multiplier follows the declared weekend discount window',async()=>{
 const {__test}=await import('../lib/index.js');
 const model={creditMultiplier:.12,activityDiscount:{current:{rate:.12,discountType:'none'},offPeak:{rate:.06,timeZone:'Asia/Shanghai',windows:[{weekdays:[6,7],startMinute:0,endMinute:1440}]}}};
 assert.equal(__test.traeModelRate(model,Date.UTC(2026,10,7,5)),.06);
 assert.equal(__test.traeModelRate(model,Date.UTC(2026,10,6,5)),.12);
 assert.equal(__test.traeModelRate({creditMultiplier:0},Date.now()),0);
});

test('Trae promotion facts retain subsidy, conditional membership and off-peak hours',async()=>{
 const {__test}=await import('../lib/index.js');
 const model={creditMultiplier:.12,activityDiscount:{current:{beforeRate:.12,rate:.12,discountType:'none'},member:{beforeRate:.12,rate:.09,discountPercent:75},offPeak:{beforeRate:.12,rate:.06,discountPercent:50,timeZone:'Asia/Shanghai',windows:[{weekdays:[6,7],startMinute:0,endMinute:1440}]}}};
 const live=__test.traeModelFacts(model,Date.UTC(2026,10,7,5));
 assert.equal(live.rate,.06);
 assert.deepEqual(live.badges,['闲时 5 折']);
 assert.match(live.promoDetails.join(' '),/周六、周日/);
 assert.match(live.promoDetails.join(' '),/0.09.*会员/);
 const inactive=__test.traeModelFacts(model,Date.UTC(2026,10,6,5));
 assert.deepEqual(inactive.badges,[]);
 assert.match(inactive.promoDetails.join(' '),/闲时 5 折/);
 const subsidy=__test.traeModelFacts({creditMultiplier:.06,activityDiscount:{current:{beforeRate:.12,rate:.06,discountPercent:50,discountType:'subsidy'}}},Date.now());
 assert.deepEqual(subsidy.badges,['专属补贴 5 折']);
 assert.match(subsidy.promoDetails.join(' '),/0.12.*0.06/);
 assert.deepEqual(__test.traeModelFacts({creditMultiplier:.8},Date.now()).promoDetails,[]);
});
