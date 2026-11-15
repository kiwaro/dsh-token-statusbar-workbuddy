import {parentPort} from 'node:worker_threads';
import {buildBilling} from './index.js';
parentPort.on('message',async({id,base,query})=>{
  try{parentPort.postMessage({id,ok:true,value:await buildBilling(base,query)});}
  catch{parentPort.postMessage({id,ok:false});}
});
