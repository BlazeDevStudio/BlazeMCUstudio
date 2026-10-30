'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WorkspaceStore}=require('../core/storage.cjs');
const {WorkspaceCatalog}=require('../core/workspaces.cjs');
const {inspect,exportPair}=require('../core/uart-workspace-export.cjs');
const {demos}=require('../core/uart-pair-sketches.cjs');
const header=fs.readFileSync(path.join(__dirname,'../core/firmware/BlazeUartFrame.h'),'utf8');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-workspace-uart-'));
 try{const store=new WorkspaceStore(path.join(root,'projects')),cat=new WorkspaceCatalog(store);
  const parent=path.join(root,'user-selected');fs.mkdirSync(parent);
  return fn(store,cat,parent,root);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
function makePair(ps,cat,{sourceBoard='esp32:esp32:esp32',targetBoard='esp8266:esp8266:generic',kind='uart'}={}){
 const a=ps.create('Gateway',sourceBoard),b=ps.create('Companion',targetBoard);
 const w=cat.create('Bench');cat.add(w.id,a.id);cat.add(w.id,b.id);
 const link=cat.link(w.id,a.id,b.id,kind).links[0];
 if(kind==='uart'&&sourceBoard==='esp32:esp32:esp32'&&targetBoard==='esp8266:esp8266:generic')
  cat.assignPins(w.id,link.id,{orientation:'source-controller',source:{tx:'17',rx:'16'},target:{tx:'1',rx:'3'}});
 return {a,b,w,link};
}
test('valid saved UART configuration exports only two independently compilable inert sketches',()=>fixture((ps,cat,parent)=>{
 const {a,b,w,link}=makePair(ps,cat);
 const files=[ps.filename(a.id),ps.filename(b.id),cat.filename];
 const bytes=files.map(p=>fs.readFileSync(p,'utf8'));
 const before=fs.readdirSync(parent);
 const review=inspect(cat,w.id,link.id);
 assert.equal(review.eligible,true);
 assert.equal(review.status,'review');
 assert.equal(review.wireApproval,false);
 assert.deepEqual(fs.readdirSync(parent),before);
 const out=exportPair(cat,w.id,link.id,parent);
 assert.equal(out.flashed,false);assert.equal(out.connected,false);
 assert.equal(out.sourceProjectsModified,false);
 assert.equal(out.sketches.length,2);
 assert.deepEqual(fs.readdirSync(out.folder).sort(),['BlazeUartEsp32Initiator','BlazeUartEsp8266Responder','READ_ME_FIRST.txt','manifest.json'].sort());
 const manifest=JSON.parse(fs.readFileSync(out.manifest,'utf8'));
 assert.equal(manifest.wireApproval,false);
 assert.equal(manifest.flashed,false);
 assert.equal(manifest.connected,false);
 assert.equal(manifest.sourceProjectId,a.id);assert.equal(manifest.targetProjectId,b.id);
 assert.deepEqual(manifest.pins.source,{tx:'17',rx:'16'});
 for(const d of demos){
  const dir=path.join(out.folder,d.name);
  assert.equal(fs.readFileSync(path.join(dir,d.name+'.ino'),'utf8'),d.source);
  assert.equal(fs.readFileSync(path.join(dir,'BlazeUartFrame.h'),'utf8'),header);
  assert.deepEqual(manifest.sketches.find(x=>x.folder===d.name),{folder:d.name,fqbn:d.fqbn});
 }
 assert.deepEqual(files.map(p=>fs.readFileSync(p,'utf8')),bytes);
}));
test('export cannot overwrite existing lab even after the contents are altered',()=>fixture((ps,cat,parent)=>{
 const {w,link}=makePair(ps,cat);
 const out=exportPair(cat,w.id,link.id,parent);
 const marker=path.join(out.folder,'important.txt');
 fs.writeFileSync(marker,'OWNER DATA DO NOT OVERWRITE');
 assert.throws(()=>exportPair(cat,w.id,link.id,parent),/Refusing to overwrite/);
 assert.equal(fs.readFileSync(marker,'utf8'),'OWNER DATA DO NOT OVERWRITE');
 assert.equal(fs.readdirSync(parent).length,1);
}));
test('missing mapping or other transport kind never generates any files',()=>fixture((ps,cat,parent)=>{
 const a=ps.create('A','esp32:esp32:esp32'),b=ps.create('B','esp8266:esp8266:generic');
 const w=cat.create('Unassigned');cat.add(w.id,a.id);cat.add(w.id,b.id);
 const missing=cat.link(w.id,a.id,b.id,'uart').links[0];
 assert.equal(inspect(cat,w.id,missing.id).eligible,false);
 assert.throws(()=>exportPair(cat,w.id,missing.id,parent),/Save an explicit/);
 const wifi=cat.link(w.id,a.id,b.id,'wifi').links.find(x=>x.kind==='wifi');
 assert.equal(inspect(cat,w.id,wifi.id).eligible,false);
 assert.throws(()=>exportPair(cat,w.id,wifi.id,parent),/Only UART links/);
 assert.deepEqual(fs.readdirSync(parent),[]);
}));
test('reversed endpoint boards or modified ESP32 pins are refused, even on non-blocked saved maps',()=>fixture((ps,cat,parent)=>{
 const {w,link}=makePair(ps,cat,{sourceBoard:'esp8266:esp8266:generic',targetBoard:'esp32:esp32:esp32'});
 assert.equal(inspect(cat,w.id,link.id).eligible,false);
 const current=makePair(ps,cat);
 const changed={orientation:'source-controller',source:{tx:'18',rx:'16'},target:{tx:'1',rx:'3'}};
 cat.assignPins(current.w.id,current.link.id,changed);
 assert.equal(cat.reviewPins(current.w.id,current.link.id).status,'review');
 assert.equal(inspect(cat,current.w.id,current.link.id).eligible,false);
 assert.throws(()=>exportPair(cat,current.w.id,current.link.id,parent),/only supports ESP32 UART1/);
 assert.deepEqual(fs.readdirSync(parent),[]);
}));
test('changing firmware peripheral assignment after save invalidates export at exact invocation',()=>fixture((ps,cat,parent)=>{
 const {a,w,link}=makePair(ps,cat);
 assert.equal(inspect(cat,w.id,link.id).eligible,true);
 const p=ps.open(a.id);
 p.peripherals=[{id:'taken17',type:'gpio',bus:'test',pins:{io:'17'}}];ps.save(p);
 const review=inspect(cat,w.id,link.id);
 assert.equal(review.eligible,false);
 assert.match(review.issues.join(' '),/peripheral/);
 assert.throws(()=>exportPair(cat,w.id,link.id,parent),/blocked/);
 assert.deepEqual(fs.readdirSync(parent),[]);
}));
test('deleted/trashed project and manual source modes are denied; restoring visual project re-enables export',()=>fixture((ps,cat,parent)=>{
 const {a,b,w,link}=makePair(ps,cat);
 const changed=ps.open(a.id);changed.source.mode='manual';changed.source.manualSource='void setup(){} void loop(){}';ps.save(changed);
 assert.equal(inspect(cat,w.id,link.id).eligible,false);
 assert.match(inspect(cat,w.id,link.id).issues.join(' '),/Manual firmware/);
 changed.source.mode='visual';changed.source.manualSource='';ps.save(changed);
 ps.trash(b.id);
 assert.equal(inspect(cat,w.id,link.id).eligible,false);
 assert.throws(()=>exportPair(cat,w.id,link.id,parent),/missing/);
 ps.recover(b.id);
 assert.equal(inspect(cat,w.id,link.id).eligible,true);
 assert.deepEqual(fs.readdirSync(parent),[]);
}));
test('tampering with saved board identity and cross-link collision fails closed, preserving projects',()=>fixture((ps,cat,parent)=>{
 const {a,w,link}=makePair(ps,cat);
 const extra=ps.create('Third','esp8266:esp8266:generic');cat.add(w.id,extra.id);
 const second=cat.link(w.id,a.id,extra.id,'uart').links.find(x=>x.id!==link.id);
 const p=path.join(ps.root,'_workspaces.json');
 const data=JSON.parse(fs.readFileSync(p,'utf8'));
 data.items[0].links.find(x=>x.id===second.id).pins={
  orientation:'source-controller',source:{tx:'17',rx:'18'},target:{tx:'1',rx:'3'}};
 fs.writeFileSync(p,JSON.stringify(data));
 assert.equal(inspect(cat,w.id,link.id).eligible,false);
 assert.match(inspect(cat,w.id,link.id).issues.join(' '),/another workspace link/);
 assert.throws(()=>exportPair(cat,w.id,link.id,parent),/blocked/);
 assert.deepEqual(fs.readdirSync(parent),[]);
}));
test('untrusted IDs and non-directory parents are rejected',()=>fixture((ps,cat,parent)=>{
 const {w,link}=makePair(ps,cat);
 assert.throws(()=>inspect(cat,w.id,'not-a-valid-id'),/not found/);
 const file=path.join(parent,'file.txt');fs.writeFileSync(file,'x');
 assert.throws(()=>exportPair(cat,w.id,link.id,file),/Select an existing/);
 assert.deepEqual(fs.readdirSync(parent),['file.txt']);
}));
