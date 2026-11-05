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
