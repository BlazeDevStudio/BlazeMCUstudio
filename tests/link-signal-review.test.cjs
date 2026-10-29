'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WorkspaceStore}=require('../core/storage.cjs');
const {WorkspaceCatalog}=require('../core/workspaces.cjs');
const uart=(tx,rx,targetTx='1',targetRx='3')=>({
 orientation:'source-controller',source:{tx,rx},target:{tx:targetTx,rx:targetRx}
});
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-recheck-'));
 try{const projects=new WorkspaceStore(root),workspaces=new WorkspaceCatalog(projects);
  return fn(projects,workspaces,root);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
function pair(projects,workspaces){
 const a=projects.create('Source','esp32:esp32:esp32');
 const b=projects.create('Target','esp8266:esp8266:generic');
 const ws=workspaces.create('Bench');
 workspaces.add(ws.id,a.id);workspaces.add(ws.id,b.id);
 const link=workspaces.link(ws.id,a.id,b.id,'uart').links[0];
 workspaces.assignPins(ws.id,link.id,uart('17','16'));
 return {a,b,ws,link};
}
test('current saved map rechecks as review-only, including no mutation or firmware approval',()=>fixture((ps,cat,root)=>{
 const {a,b,ws,link}=pair(ps,cat);
 const files=[ps.filename(a.id),ps.filename(b.id),path.join(root,'_workspaces.json')];
 const bytes=files.map(x=>fs.readFileSync(x,'utf8'));
 const result=cat.reviewPins(ws.id,link.id);
 assert.equal(result.status,'review');
 assert.equal(result.assigned,true);
 assert.equal(result.safeToWire,false);
 assert.equal(result.firmwareGenerated,false);
 assert.equal(result.sourceBoard,'esp32:esp32:esp32');
 assert.equal(result.targetBoard,'esp8266:esp8266:generic');
 assert.deepEqual(files.map(x=>fs.readFileSync(x,'utf8')),bytes);
 assert.equal(cat.assess(ws.id,link.id).savedPinsStatus,'review');
}));
test('a later project peripheral edit invalidates persisted map, and a repair restores review status',()=>fixture((ps,cat)=>{
 const {a,ws,link}=pair(ps,cat);
 const p=ps.open(a.id);
 p.peripherals=[{id:'reserved17',type:'gpio',bus:'test',pins:{io:'17'}}];
 ps.save(p);
 const recheck=cat.reviewPins(ws.id,link.id);
 assert.equal(recheck.status,'blocked');
 assert.match(recheck.errors.join(' '),/reserved by a project peripheral/);
 assert.equal(cat.assess(ws.id,link.id).status,'blocked');
 assert.deepEqual(cat.get(ws.id).links[0].pins,uart('17','16'));
 p.peripherals=[];ps.save(p);
 assert.equal(cat.reviewPins(ws.id,link.id).status,'review');
}));
test('active editor firmware GPIO change is checked against the saved pins',()=>fixture((ps,cat)=>{
 const {a,ws,link}=pair(ps,cat);
 const p=ps.open(a.id);
 p.graph.nodes.find(n=>n.type==='pinMode').params.pin='17';
 ps.save(p);
 const out=cat.reviewPins(ws.id,link.id);
 assert.equal(out.status,'blocked');
 assert.match(out.errors.join(' '),/owned by active firmware logic/);
}));
test('another workspace link edited to collide after initial save is detected on both reviews',()=>fixture((ps,cat,root)=>{
 const {a,ws,link:first}=pair(ps,cat);
 const other=ps.create('Additional','esp8266:esp8266:generic');
 cat.add(ws.id,other.id);
 const second=cat.link(ws.id,a.id,other.id,'uart').links.find(l=>l.id!==first.id);
 cat.assignPins(ws.id,second.id,uart('18','19'));
 assert.equal(cat.reviewPins(ws.id,first.id).status,'review');
 const file=path.join(root,'_workspaces.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));
 data.items[0].links.find(l=>l.id===second.id).pins.source.tx='17';
 fs.writeFileSync(file,JSON.stringify(data));
 const result=cat.reviewPins(ws.id,first.id);
 assert.equal(result.status,'blocked');
 assert.match(result.errors.join(' '),/already selected by another workspace link/);
 assert.equal(cat.assess(ws.id,first.id).status,'blocked');
}));
test('missing endpoint yields explicit blocked recheck, while recover restores saved map',()=>fixture((ps,cat)=>{
 const {b,ws,link}=pair(ps,cat);
 ps.trash(b.id);
 const missing=cat.reviewPins(ws.id,link.id);
 assert.equal(missing.status,'blocked');
 assert.equal(missing.assigned,true);
 assert.match(missing.errors.join(' '),/missing, in recovery/);
 assert.equal(cat.assess(ws.id,link.id).status,'blocked');
 ps.recover(b.id);
 assert.equal(cat.reviewPins(ws.id,link.id).status,'review');
}));
test('unassigned and invalid link IDs are explicitly refused without creating maps',()=>fixture((ps,cat)=>{
 const a=ps.create('A','esp32:esp32:esp32'),b=ps.create('B','esp8266:esp8266:generic');
 const ws=cat.create('New');cat.add(ws.id,a.id);cat.add(ws.id,b.id);
 const link=cat.link(ws.id,a.id,b.id,'uart').links[0];
 const result=cat.reviewPins(ws.id,link.id);
 assert.equal(result.status,'unassigned');
 assert.equal(result.assigned,false);
 assert.equal(cat.get(ws.id).links[0].pins,undefined);
 assert.throws(()=>cat.reviewPins(ws.id,'../../escape'),/Invalid planned link ID/);
 assert.throws(()=>cat.reviewPins(ws.id,a.id),/Planned link not found/);
}));
test('legacy saved map with incompatible electrical levels is now detected rather than implicitly accepted',()=>fixture((ps,cat,root)=>{
 const a=ps.create('Uno','arduino:avr:uno'),b=ps.create('Esp','esp32:esp32:esp32');
 const ws=cat.create('Migration');cat.add(ws.id,a.id);cat.add(ws.id,b.id);
 const link=cat.link(ws.id,a.id,b.id,'uart').links[0];
 const file=path.join(root,'_workspaces.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));
 data.items[0].links[0].pins=uart('1','0','17','16');
 fs.writeFileSync(file,JSON.stringify(data));
 const result=cat.reviewPins(ws.id,link.id);
 assert.equal(result.status,'blocked');
 assert.match(result.errors.join(' '),/Logic-level mismatch/);
 assert.equal(cat.assess(ws.id,link.id).status,'blocked');
 assert.equal(cat.get(ws.id).links[0].pins.source.tx,'1');
}));
