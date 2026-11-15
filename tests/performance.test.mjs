import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import {BillingWorker} from '../lib/billing-worker.js';
import {readUsageTranscript} from '../lib/usage-transcript.js';

test('long transcript is reduced to usage, invalidated after append, and accounted away from main thread',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-performance-'));
 process.env.DSH_HOME=root;
 const session='session-synthetic',dir=path.join(root,'sessions','workspace',session);
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'session.v4.jsonl.zstd');
 const at=Date.now()-1000,frames=[];
 for(let i=0;i<1000;i++)frames.push(zlib.zstdCompressSync(Buffer.from(JSON.stringify({type:'assistant/message',time:at,data:{turn:i,step:1,usage:{inputTokens:100,cacheReadTokens:20,cacheWriteTokens:3,outputTokens:5},message:{content:'PRIVATE-BODY-'.repeat(2000),source:{replayState:{response:{provider:'workbuddy',model:'deepseek-v4.1-flash',responseId:'r'+i}}}}}})+'\n')));
 fs.writeFileSync(file,Buffer.concat(frames));
 const compact=readUsageTranscript(file);assert(!compact.includes('PRIVATE-BODY'));assert(Buffer.byteLength(compact)<600000);
 assert.equal(readUsageTranscript(file),compact);
 fs.appendFileSync(file,zlib.zstdCompressSync(Buffer.from('{"type":"assistant/message","time":1,"data":{"usage":{"outputTokens":1}}}\n')));
 assert.notEqual(readUsageTranscript(file),compact);
 const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'signed-in',models:[]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const worker=new BillingWorker(),base='http://127.0.0.1:'+server.address().port;
 let last=performance.now(),maximumGap=0;
 const timer=setInterval(()=>{const now=performance.now();maximumGap=Math.max(maximumGap,now-last);last=now;},10);
 try{
  const first=worker.request(base,{sessions:session,fresh:'1'});
  assert.equal(worker.request(base,{sessions:session,fresh:'1'}),first);
  const result=await first;
  assert.equal(result.periodSplit[session].total.uncached,100000);
  assert.equal(result.periodSplit[session].total.cacheRead,20000);
  assert.equal(result.periodSplit[session].total.cacheWrite,3000);
  assert.equal(result.periodSplit[session].total.output,5001);
  assert.equal(Object.keys(result.bySession[session].coverage.turns).length,1000);
  assert(maximumGap<300,'Main event loop was blocked: '+maximumGap);
  assert(!fs.existsSync(path.join(root,'storages','dsh-token-statusbar-workbuddy','payload-cache.json')),'Reproducible payload must not be written to disk');
  const requests=Array.from({length:9},(_,i)=>worker.request(base,{model:'m'+i}));
  const outcomes=await Promise.allSettled(requests);assert(outcomes.some(r=>r.status==='rejected'),'Queue must be bounded');
  console.log('Synthetic 24 MiB conversation: main-loop maximum gap '+maximumGap.toFixed(1)+' ms; no payload-cache write');
 }finally{clearInterval(timer);worker.close();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
});

test('historical imports batch disk writes and retain corrected actual credits',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-batch-'));process.env.DSH_HOME=root;
 const {__test}=await import('../lib/index.js');const known=new Map();
 const original=fs.appendFileSync;let writes=0;
 fs.appendFileSync=(...args)=>{writes++;return original(...args);};
 try{
  const records=Array.from({length:2000},(_,i)=>({r:'r'+i,c:1,t:100}));
  assert.equal(__test.appendLedgerRecords(known,'session-synthetic',records),2000);assert.equal(writes,1);
  assert.equal(__test.appendLedgerRecords(known,'session-synthetic',records),0);assert.equal(writes,1);
  assert.equal(__test.appendLedgerRecords(known,'session-synthetic',[{r:'r0',c:2,t:101}]),1);
  assert.equal(__test.readLedger().get('session-synthetic\0r0').c,2);assert.equal(writes,2);
 }finally{fs.appendFileSync=original;fs.rmSync(root,{recursive:true,force:true});}
});


test('unchanged balance samples do not write; later credit corrections persist',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-sampler-'));process.env.DSH_HOME=root;
 const {startBalanceSampler}=await import('../lib/reconciliation.js');
 const originalFetch=globalThis.fetch;
 let samples=0,credit=1,balance=100;
 globalThis.fetch=async()=>({ok:true,json:async()=>({accounts:[{id:'synthetic',credits:balance}]})});
 const waitFor=async predicate=>{const until=Date.now()+2000;while(!predicate()){assert(Date.now()<until,'Sampler did not run');await new Promise(r=>setTimeout(r,5));}};
 const stop=startBalanceSampler(20,()=> 'http://127.0.0.1',()=>{samples++;return new Map([['r',{a:'synthetic',c:credit,t:1}]]);});
 const log=path.join(root,'storages','dsh-token-statusbar-workbuddy','account-reconciliation.jsonl');
 const snapshot=log.slice(0,-1);
 try{
  await waitFor(()=>samples>=1 && fs.existsSync(snapshot));
  const before=fs.readFileSync(snapshot,'utf8'),stamp=fs.statSync(snapshot).mtimeMs;
  await waitFor(()=>samples>=4);
  assert.equal(fs.readFileSync(snapshot,'utf8'),before);assert.equal(fs.statSync(snapshot).mtimeMs,stamp);
  assert.equal(fs.readFileSync(log,'utf8').trim().split('\n').length,1);
  credit=2;balance=99;await waitFor(()=>JSON.parse(fs.readFileSync(snapshot,'utf8')).accounts.synthetic.balance===99);
  const after=fs.readFileSync(snapshot,'utf8');await waitFor(()=>samples>=8);
  assert.equal(fs.readFileSync(snapshot,'utf8'),after);
  assert.equal(fs.readFileSync(log,'utf8').trim().split('\n').length,2);
 }finally{stop();globalThis.fetch=originalFetch;fs.rmSync(root,{recursive:true,force:true});}
});
