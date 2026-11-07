/** Read-only Trae calibration sampling. Private observations stay in DSH storage. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { __test as transcriptReader } from '../src/index.js';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sessionId = process.argv[2];
if (!/^session-[a-f0-9-]{36}$/.test(sessionId || '')) throw new Error('Expected a session ID');
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const output = path.join(home, 'storages', 'dsh-token-statusbar-workbuddy', 'trae-sampling', sessionId);
fs.mkdirSync(output, {recursive:true, mode:0o700});
const append = (name, value) => fs.appendFileSync(path.join(output,name), JSON.stringify(value)+'\n', {mode:0o600});
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,24);
const statePath = path.join(output,'state.json');
let state={responses:{}};
try {state=JSON.parse(fs.readFileSync(statePath,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
let transcript;
for (const workspace of fs.readdirSync(path.join(home,'sessions'))) {
 const dir=path.join(home,'sessions',workspace,sessionId);
 for (const name of ['session.v4.jsonl.zstd','session.v4.jsonl']) {
  const file=path.join(dir,name);if(fs.existsSync(file)){transcript=file;break;}
 }
 if(transcript)break;
}
if(!transcript)throw new Error('Target session transcript is not present');
const at=Date.now();
const text=transcript.endsWith('.zstd') ? transcriptReader.readTranscript(transcript) : fs.readFileSync(transcript,'utf8');
let createdAt=null;
for(const line of text.split('\n')){try{const event=JSON.parse(line);if(event.type==='session' && Number.isFinite(Number(event.createdAt))) {createdAt=Number(event.createdAt);break;}}catch{}}
const responses=new Map();
for(const line of text.split('\n')) {
 let e;try{e=JSON.parse(line);}catch{continue;}
 if(e.type!=='assistant/message')continue;
 if(createdAt!==null && Number(e.time)<createdAt)continue;
 const source=e.data?.message?.source || e.data?.source;
 const r=source?.replayState?.response;
 const provider=r?.provider || source?.provider;
 if(!['trae','trae-enterprise','trae-global'].includes(provider))continue;
 const identity=r?.responseId || (Number.isInteger(e.data?.turn)&&Number.isInteger(e.data?.step)?`turn:${e.data.turn}:step:${e.data.step}`:null);
 if(!identity)continue;
 const usage={};for(const key of ['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'])usage[key]=Number.isFinite(e.data?.usage?.[key])?e.data.usage[key]:null;
 const row={provider,model:r?.model || source?.model,response:hash(provider+'/'+identity),time:Number(e.time),turn:e.data?.turn,step:e.data?.step,usage};
 responses.set(row.response,row);
}
let changed=0;
for(const [id,row] of responses){const fingerprint=hash(JSON.stringify(row));if(state.responses[id]!==fingerprint){append('responses.jsonl',{observedAt:at,...row});state.responses[id]=fingerprint;changed++;}}
const command="$apps=@(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue); @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -in $apps.Id -and $_.LocalAddress -eq '127.0.0.1' -and $_.LocalPort -ne 9230 } | Select-Object -ExpandProperty LocalPort -Unique | Sort-Object) | ConvertTo-Json -Compress";
const ports=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true}).trim() || '[]');
let status;
for(const port of [].concat(ports)){
 try {const res=await fetch(`http://127.0.0.1:${port}/plugins/dsh-connect-trae/usage?region=cn`,{signal:AbortSignal.timeout(2500)});if(!res.ok)continue;const doc=await res.json();if(['signed-in','signed-out'].includes(doc.status)){status=doc;break;}}catch{}
}
if(!status){append('samples.jsonl',{at,status:'host-unavailable',responseCount:responses.size,changed});throw new Error('Trae host route unavailable; token observations were saved');}
const credits={};for(const key of ['total','consumed','available','workAvailable','generalAvailable'])credits[key]=Number.isFinite(status.credits?.[key])?status.credits[key]:null;
const account=status.accountId ? hash(status.accountId) : null;
const old=state.last;
const sameAccount=account && old?.account===account;
const sample={at,status:status.status,account,credits,responseCount:responses.size,changed,
 delta:sameAccount ? {since:old.at,consumed:credits.consumed!==null&&old.credits.consumed!==null?credits.consumed-old.credits.consumed:null,generalBalance:credits.generalAvailable!==null&&old.credits.generalAvailable!==null?old.credits.generalAvailable-credits.generalAvailable:null}:null,
 models:(status.models||[]).map(m=>({id:m.id,creditMultiplier:m.creditMultiplier,activityDiscount:m.activityDiscount})),
 attribution:'account-observation',sessionId};
append('samples.jsonl',sample);
state.last={at,account,credits};
fs.writeFileSync(statePath+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(statePath+'.tmp',statePath);
console.log(JSON.stringify({ok:true,sessionId,responseCount:responses.size,newOrUpdated:changed,status:status.status,balanceCaptured:credits.generalAvailable!==null,output}));
