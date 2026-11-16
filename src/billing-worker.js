import {Worker} from 'node:worker_threads';

/** One bounded accounting worker keeps decompression and synchronous disk work off DSH's event loop. */
export class BillingWorker {
  constructor({idleMs=90000}={}){this.idleMs=idleMs;this.idleTimer=null;this.worker=null;this.pending=new Map();this.active=null;this.serial=0;this.closed=false;}
  request(base,query){
    if(this.closed)return Promise.reject(new Error('billing-closed'));
    let url;try{url=new URL(base);}catch{return Promise.reject(new Error('billing-origin'));}
    if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname))return Promise.reject(new Error('billing-origin'));
    const key=JSON.stringify([base,query]);
    if(this.pending.has(key))return this.pending.get(key).promise;
    if(this.pending.size>=8)return Promise.reject(new Error('billing-busy'));
    let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
    this.pending.set(key,{id:++this.serial,key,base,query,promise,resolve,reject});this.pump();return promise;
  }
  pump(){
    if(this.closed||this.active)return;
    clearTimeout(this.idleTimer);this.idleTimer=null;
    if(!this.pending.size){
      const worker=this.worker;
      if(worker){
        this.idleTimer=setTimeout(()=>{
          if(this.worker!==worker||this.active||this.pending.size)return;
          this.worker=null;this.idleTimer=null;void worker.terminate();
        },this.idleMs);
        this.idleTimer.unref();
      }
      return;
    }
    if(!this.worker){
      const worker=new Worker(new URL('./billing-worker-entry.js',import.meta.url),{execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32}});
      this.worker=worker;worker.unref();
      worker.on('message',message=>{if(this.worker!==worker||message.id!==this.active?.id)return;const item=this.active;clearTimeout(this.timer);this.active=null;this.pending.delete(item.key);message.ok?item.resolve(message.value):item.reject(new Error('billing-failed'));this.pump();});
      worker.on('error',()=>{if(this.worker===worker)this.fail();});
      worker.on('exit',()=>{if(this.worker===worker)this.fail();});
    }
    this.active=this.pending.values().next().value;
    this.timer=setTimeout(()=>this.fail(),30000);this.timer.unref();
    this.worker.postMessage({id:this.active.id,base:this.active.base,query:this.active.query});
  }
  fail(){clearTimeout(this.idleTimer);this.idleTimer=null;const worker=this.worker;this.worker=null;clearTimeout(this.timer);this.active=null;for(const item of this.pending.values())item.reject(new Error('billing-unavailable'));this.pending.clear();if(worker)void worker.terminate();}
  close(){this.closed=true;this.fail();}
}
