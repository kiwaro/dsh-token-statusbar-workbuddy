import fs from 'node:fs';
import zlib from 'node:zlib';

const cache=new Map();
const MAX_CACHE_BYTES=16*1024*1024,MAX_COMPRESSED=64*1024*1024,MAX_DECODED=256*1024*1024;
let cacheBytes=0;
const limit=()=>Object.assign(new Error('Transcript exceeds accounting limit'),{code:'EUSAGELIMIT'});

/** Retain usage metadata only; conversation text never enters the accounting cache. */
export function readUsageTranscript(file){
  let stat;try{stat=fs.statSync(file);}catch{return '';}
  const stamp=[stat.size,stat.mtimeMs,stat.ctimeMs,stat.ino].join(':');
  const previous=cache.get(file);
  if(previous?.stamp===stamp){cache.delete(file);cache.set(file,previous);return previous.text;}
  if(previous){cache.delete(file);cacheBytes-=previous.bytes;}
  if(stat.size>MAX_COMPRESSED)throw limit();
  const input=fs.readFileSync(file),starts=[];
  for(let i=0;i<input.length-3;i++)if(input[i]===0x28&&input[i+1]===0xb5&&input[i+2]===0x2f&&input[i+3]===0xfd)starts.push(i);
  const rows=[];let decoded=0,bytes=0;
  for(let i=0;i<starts.length;i++){
    let frame;
    try{frame=zlib.zstdDecompressSync(input.subarray(starts[i],starts[i+1]??input.length),{maxOutputLength:16*1024*1024});}
    catch(error){if(error.code==='ERR_BUFFER_TOO_LARGE')throw limit();continue;}
    decoded+=frame.length;if(decoded>MAX_DECODED)throw limit();
    for(const line of frame.toString('utf8').split('\n')){
      let event;try{event=JSON.parse(line);}catch{continue;}
      if(event?.type!=='assistant/message')continue;
      const source=event.data?.message?.source??event.data?.source,response=source?.replayState?.response;
      const usage=event.data?.usage;
      const row=JSON.stringify({type:event.type,time:event.time,data:{turn:event.data?.turn,step:event.data?.step,
        usage:usage?Object.fromEntries(['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'].map(k=>[k,usage[k]])):undefined,
        source:{provider:source?.provider,model:source?.model,replayState:{response:response?{provider:response.provider,model:response.model,responseId:response.responseId}:undefined}}}});
      bytes+=Buffer.byteLength(row)+1;if(bytes>MAX_CACHE_BYTES)throw limit();rows.push(row);
    }
  }
  const text=rows.join('\n');
  while(cache.size>=32||cacheBytes+bytes>MAX_CACHE_BYTES){const key=cache.keys().next().value;cacheBytes-=cache.get(key).bytes;cache.delete(key);}
  cache.set(file,{stamp,text,bytes});cacheBytes+=bytes;
  return text;
}
