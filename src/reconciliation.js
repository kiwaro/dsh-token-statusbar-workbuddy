import fs from 'node:fs';
import path from 'node:path';
import { storageDir } from './storage.js';
import { reportDiagnostic } from './diagnostics.js';

export function appendReconciliationLog(file, snapshot, maxBytes = 1024 * 1024) {
 const line = JSON.stringify(snapshot) + '\n';
 if (Buffer.byteLength(line) > maxBytes) throw Object.assign(new Error('Snapshot exceeds log limit'), {code:'ELOGSIZE'});
 let size = 0;
 try { size = fs.statSync(file).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
 if (size + Buffer.byteLength(line) > maxBytes) {
  for (let n = 2; n >= 1; n--) {
   const source = n === 1 ? file : file + '.' + (n - 1);
   try { fs.copyFileSync(source, file + '.' + n); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  fs.writeFileSync(file, '', {mode:0o600});
 }
 fs.appendFileSync(file, line, {encoding:'utf8',mode:0o600});
}
function reconciliationPath() { return path.join(storageDir(), 'account-reconciliation.json'); }
export function readReconciliation() {
 try { const value=JSON.parse(fs.readFileSync(reconciliationPath(), 'utf8')); if(!value || !value.accounts || typeof value.accounts !== 'object' || Array.isArray(value.accounts)) throw new Error('Invalid reconciliation'); return value; } catch(error) { if(error.code !== 'ENOENT') reportDiagnostic('reconciliation-read',error); return {accounts:{},at:null}; }
}
export function reconcileAccounts(accounts, previous, records, now) {
 const next = { accounts: {...previous.accounts}, at:now };
 for(const account of accounts) {
  if(!account || typeof account.id!=='string' || typeof account.credits!=='number' || !Number.isFinite(account.credits)) continue;
  const candidate=previous.accounts?.[account.id];
  const old=candidate && Number.isFinite(candidate.balance) && Number.isFinite(candidate.at) ? candidate : null;
  let observed=0, journalTotal=0;
  for(const r of records.values()) {
   if(r.a===account.id && r.t<=now) {
    journalTotal+=r.c;
    if(old && r.t>old.at) observed+=r.c;
   }
  }
  if(old && Number.isFinite(old.journalTotal)) observed=journalTotal-old.journalTotal;
  const drop=old ? old.balance-account.credits : null;
  next.accounts[account.id]={balance:account.credits,journalTotal:Number(journalTotal.toFixed(6)),at:now,previousAt:old?.at ?? null,balanceDrop:drop,observedCredit:Number(observed.toFixed(4)),difference:drop===null?null:Number((drop-observed).toFixed(4)),source:'balance-observation'};
 }
 return next;
}
export function startBalanceSampler(intervalMs, resolveBase, readResponseCredits) {
 let running=false,stopped=false;
 const tick=async()=>{
  if(running || stopped)return;running=true;
  try {
   const accounts=[];
   for(const region of ['cn','global']) {
    try {
    const response=await fetch(resolveBase()+'/plugins/dsh-connect-workbuddy/account-credits?region='+region,{signal:AbortSignal.timeout(15000)});
    if(response.ok){ const page=await response.json(); if(Array.isArray(page.accounts))accounts.push(...page.accounts); else reportDiagnostic('balance-response-'+region,{code:'EFORMAT'}); } else reportDiagnostic('balance-fetch-'+region,{code:'HTTP'+response.status});
    } catch(error) {reportDiagnostic('balance-fetch-'+region,error);}
   }
   if(!accounts.length || stopped)return;
   const records=readResponseCredits();
   const next=reconcileAccounts(accounts,readReconciliation(),records,Date.now());
   fs.mkdirSync(storageDir(),{recursive:true});
   appendReconciliationLog(path.join(storageDir(),'account-reconciliation.jsonl'),next);
   const snapshotPath=reconciliationPath();
   fs.writeFileSync(snapshotPath+'.tmp',JSON.stringify(next),{encoding:'utf8',mode:0o600});
   fs.renameSync(snapshotPath+'.tmp',snapshotPath);
  }catch(error){reportDiagnostic('balance-sampler',error);}finally{running=false;}
 };
 const timer=setInterval(()=>void tick(),intervalMs);if(typeof timer.unref==='function')timer.unref();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}

