import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {storageDir,DATA_FILES,PLUGIN_NAME,LEGACY_PLUGIN_NAME} from '../lib/storage.js';
test('rename copies selected data, preserves existing data and original files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'statusbar-migration-'));const previous=process.env.DSH_HOME;
 try{process.env.DSH_HOME=root;const old=path.join(root,'storages',LEGACY_PLUGIN_NAME);const target=path.join(root,'storages',PLUGIN_NAME);fs.mkdirSync(old,{recursive:true});fs.mkdirSync(target,{recursive:true});
 for(const name of DATA_FILES)fs.writeFileSync(path.join(old,name),'old-'+name);
 fs.writeFileSync(path.join(target,DATA_FILES[0]),'new');fs.writeFileSync(path.join(old,'credentials.json'),'private');
 assert.equal(storageDir(),target);assert.equal(fs.readFileSync(path.join(target,DATA_FILES[0]),'utf8'),'new');
 for(const name of DATA_FILES.slice(1))assert.equal(fs.readFileSync(path.join(target,name),'utf8'),'old-'+name);
 assert.equal(fs.existsSync(path.join(target,'credentials.json')),false);
 fs.writeFileSync(path.join(old,DATA_FILES[1]),'changed');storageDir();assert.equal(fs.readFileSync(path.join(target,DATA_FILES[1]),'utf8'),'old-'+DATA_FILES[1]);
 assert.equal(fs.readFileSync(path.join(old,DATA_FILES[0]),'utf8'),'old-'+DATA_FILES[0]);
 }finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;fs.rmSync(root,{recursive:true,force:true});}
});
