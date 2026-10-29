'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createProject}=require('../core/project.cjs');
const {WorkspaceStore}=require('../core/storage.cjs');
const {WorkspaceCatalog}=require('../core/workspaces.cjs');
const {checkPins,parseShape}=require('../core/link-signal-plan.cjs');
const esp=()=>createProject('ESP32','esp32:esp32:esp32');
const esp8266=()=>createProject('ESP8266','esp8266:esp8266:generic');
const uno=()=>createProject('Uno','arduino:avr:uno');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-signals-'));
 try{const store=new WorkspaceStore(root);return fn(store,new WorkspaceCatalog(store),root);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
const uart=(tx,rx,toTx='1',toRx='3')=>({orientation:'source-controller',source:{tx,rx},target:{tx:toTx,rx:toRx}});
const spi=(from,to,orientation='source-controller')=>({orientation,source:from,target:to});

test('separate project ESP32 and ESP8266 UART pins are persisted and can be cleared without firmware mutation',()=>fixture((s,w,root)=>{
 const a=s.create('A','esp32:esp32:esp32'),b=s.create('B','esp8266:esp8266:generic');
 const before=[fs.readFileSync(s.filename(a.id),'utf8'),fs.readFileSync(s.filename(b.id),'utf8')];
 const group=w.create('Lab');w.add(group.id,a.id);w.add(group.id,b.id);
 const link=w.link(group.id,a.id,b.id,'uart').links[0];
 const result=w.assignPins(group.id,link.id,uart('17','16'));
 assert.deepEqual(result.links[0].pins,uart('17','16'));
 assert.deepEqual(new WorkspaceCatalog(new WorkspaceStore(root)).get(group.id).links[0].pins,uart('17','16'));
 assert.equal(fs.readFileSync(s.filename(a.id),'utf8'),before[0]);
 assert.equal(fs.readFileSync(s.filename(b.id),'utf8'),before[1]);
 w.clearPins(group.id,link.id);
 assert.equal(w.get(group.id).links[0].pins,undefined);
}));
test('mixed-voltage Uno to ESP direct UART pin assignment rejected without persisted side effects',()=>fixture((s,w)=>{
 const a=s.create('A','arduino:avr:uno'),b=s.create('B','esp32:esp32:esp32');
 const g=w.create('Bench');w.add(g.id,a.id);w.add(g.id,b.id);
 const l=w.link(g.id,a.id,b.id,'uart').links[0];
 assert.throws(()=>w.assignPins(g.id,l.id,uart('1','0','17','16')),/Logic-level mismatch/);
 assert.equal(w.get(g.id).links[0].pins,undefined);
}));
test('occupied graph and peripheral GPIO are rejected instead of overridden',()=>{
 const a=esp(),b=esp8266();
 assert.match(checkPins(a,b,'uart',uart('21','16')).errors.join(' '),/owned by active firmware/);
 a.peripherals=[{id:'ext',type:'gpio',bus:'default',pins:{io:'17'}}];
 assert.match(checkPins(a,b,'uart',uart('17','16')).errors.join(' '),/reserved by a project peripheral/);
});
test('existing workspace signal claims on a shared project reject competing link allocations',()=>fixture((s,w)=>{
 const a=s.create('A','esp32:esp32:esp32'),b=s.create('B','esp8266:esp8266:generic'),c=s.create('C','esp8266:esp8266:generic');
 const g=w.create('Multi');for(const p of [a,b,c])w.add(g.id,p.id);
 const first=w.link(g.id,a.id,b.id,'uart').links[0];
 w.assignPins(g.id,first.id,uart('17','16'));
 const second=w.link(g.id,a.id,c.id,'uart').links.find(x=>x.id!==first.id);
 assert.throws(()=>w.assignPins(g.id,second.id,uart('17','18')),/already selected by another workspace link/);
 assert.equal(w.get(g.id).links.find(x=>x.id===second.id).pins,undefined);
 assert.deepEqual(w.get(g.id).links.find(x=>x.id===first.id).pins,uart('17','16'));
}));
test('duplicate GPIO within one endpoint, input-only output and forbidden pins block',()=>{
 const a=esp(),b=esp8266();
 assert.match(checkPins(a,b,'uart',uart('17','17')).errors.join(' '),/cannot share GPIO/);
 assert.match(checkPins(a,b,'uart',uart('34','16')).errors.join(' '),/input-only/);
 assert.match(checkPins(a,b,'uart',uart('6','16')).errors.join(' '),/reserved or unavailable/);
});
test('Uno and ESP8266 fixed hardware serial pin references cannot be silently remapped',()=>{
 const a=uno(),b=esp8266();
 assert.match(checkPins(a,b,'uart',uart('2','0')).errors.join(' '),/requires documented 1/);
 assert.match(checkPins(esp(),b,'uart',uart('17','16','2','3')).errors.join(' '),/requires documented 1/);
});
test('complete SPI roles persist for an ESP pair when not assigned elsewhere',()=>fixture((s,w)=>{
 const a=s.create('A','esp32:esp32:esp32'),b=s.create('B','esp8266:esp8266:generic');
 const g=w.create('SPI');w.add(g.id,a.id);w.add(g.id,b.id);
 const link=w.link(g.id,a.id,b.id,'spi').links[0];
 const selected=spi({sck:'18',miso:'19',mosi:'23',cs:'5'},{sck:'14',miso:'12',mosi:'13',cs:'15'});
 const r=w.assignPins(g.id,link.id,selected);
 assert.deepEqual(r.links[0].pins,selected);
 assert.equal(checkPins(s.open(a.id),s.open(b.id),'spi',selected).safeToWire,false);
}));
test('malformed, excess and injected pins fail closed on save and catalog reload',()=>fixture((s,w,root)=>{
 const a=s.create('A','esp32:esp32:esp32'),b=s.create('B','esp8266:esp8266:generic');
 const g=w.create('Secure');w.add(g.id,a.id);w.add(g.id,b.id);
 const l=w.link(g.id,a.id,b.id,'uart').links[0];
 assert.throws(()=>w.assignPins(g.id,l.id,{...uart('17','16'),evil:'x'}),/shape/);
 assert.throws(()=>w.assignPins(g.id,l.id,{orientation:'source-controller',source:{tx:'17'},target:{tx:'1',rx:'3'}}),/Incomplete/);
 assert.throws(()=>parseShape('wifi',uart('17','16')),/shape/);
 assert.throws(()=>w.assignPins(g.id,l.id,uart('../../bad','16')),/Invalid/);
 assert.equal(w.get(g.id).links[0].pins,undefined);
 const file=path.join(root,'_workspaces.json'),obj=JSON.parse(fs.readFileSync(file,'utf8'));
 obj.items[0].links[0].pins={...uart('17','16'),inject:'tamper'};
 fs.writeFileSync(file,JSON.stringify(obj));
 assert.throws(()=>w.list(),/shape/);
 assert.equal(s.open(a.id).name,'A');
}));
test('link removal and deletion remove pin records without altering projects',()=>fixture((s,w)=>{
 const a=s.create('A','esp32:esp32:esp32'),b=s.create('B','esp8266:esp8266:generic');
 const g=w.create('Clear');w.add(g.id,a.id);w.add(g.id,b.id);
 const l=w.link(g.id,a.id,b.id,'uart').links[0];
 w.assignPins(g.id,l.id,uart('17','16'));w.unlink(g.id,l.id);
 assert.equal(w.get(g.id).links.length,0);assert.equal(s.open(a.id).name,'A');
}));
