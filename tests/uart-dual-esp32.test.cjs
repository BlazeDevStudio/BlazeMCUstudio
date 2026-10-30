'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {WorkspaceStore}=require('../core/storage.cjs');
const {WorkspaceCatalog}=require('../core/workspaces.cjs');
const {inspect,exportPair,PAIRS}=require('../core/uart-workspace-export.cjs');
const {demos,esp32Responder}=require('../core/uart-pair-sketches.cjs');
const pins=(sourceTx='17',targetTx='25',targetRx='26')=>({
 orientation:'source-controller',
 source:{tx:sourceTx,rx:'16'},target:{tx:targetTx,rx:targetRx}
});
function fixture(fn){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-dual-uart-'));
 try{
  const projects=new WorkspaceStore(path.join(home,'projects'));
  const workspace=new WorkspaceCatalog(projects);
  const target=path.join(home,'export');fs.mkdirSync(target);
  const a=projects.create('Initiator','esp32:esp32:esp32');
  const b=projects.create('Responder','esp32:esp32:esp32');
  const w=workspace.create('Dual32');workspace.add(w.id,a.id);workspace.add(w.id,b.id);
  const link=workspace.link(w.id,a.id,b.id,'uart').links[0];
  return fn({home,projects,workspace,target,a,b,w,link});
 }finally{fs.rmSync(home,{recursive:true,force:true});}
}
test('second UART pair retains explicit independent reviewed board- and peripheral-specific pins',()=>fixture(x=>{
 x.workspace.assignPins(x.w.id,x.link.id,pins());
 const review=x.workspace.reviewPins(x.w.id,x.link.id);
 assert.equal(review.status,'review');
 assert.equal(review.safeToWire,false);
 const elig=inspect(x.workspace,x.w.id,x.link.id);
 assert.equal(elig.variant,'dual-esp32-uart1');
 assert.equal(elig.eligible,true);
 assert.equal(elig.wireApproval,false);
 assert.equal(elig.connected,false);
 assert.equal(elig.flashed,false);
 assert.equal(PAIRS['esp32:esp32:esp32'].serial,'ESP32 UART1 RX26/TX25');
}));
test('two ESP32 lab firmwares exactly match compiled shared templates and preserve original projects',()=>fixture(x=>{
 x.workspace.assignPins(x.w.id,x.link.id,pins());
 const projects=[x.projects.filename(x.a.id),x.projects.filename(x.b.id),x.workspace.filename];
 const original=projects.map(p=>fs.readFileSync(p,'utf8'));
 const result=exportPair(x.workspace,x.w.id,x.link.id,x.target);
 const manifest=JSON.parse(fs.readFileSync(result.manifest,'utf8'));
 assert.equal(manifest.variant,'dual-esp32-uart1');
 assert.equal(manifest.sourceFqbn,'esp32:esp32:esp32');
 assert.equal(manifest.targetFqbn,'esp32:esp32:esp32');
 assert.deepEqual(manifest.pins.target,{tx:'25',rx:'26'});
 assert.equal(manifest.uartRouting.target,'ESP32 UART1 RX26/TX25');
 assert.deepEqual(manifest.sketches.map(s=>s.folder),[demos[0].name,esp32Responder.name]);
 const libraryHeader=fs.readFileSync(path.join(__dirname,'../core/firmware/BlazeUartFrame.h'),'utf8');
 for(const d of [demos[0],esp32Responder]){
  const dir=path.join(result.folder,d.name);
  assert.equal(fs.readFileSync(path.join(dir,d.name+'.ino'),'utf8'),d.source);
  assert.equal(fs.readFileSync(path.join(dir,'BlazeUartFrame.h'),'utf8'),libraryHeader);
 }
 assert(esp32Responder.source.includes('Serial1.begin(9600,SERIAL_8N1,26,25)'));
 assert(!/\b(?:digitalWrite|pinMode|analogWrite)\s*\(/.test(esp32Responder.source));
 assert.deepEqual(projects.map(p=>fs.readFileSync(p,'utf8')),original);
 assert.equal(result.flashed,false);assert.equal(result.connected,false);
 assert.equal(result.sourceProjectsModified,false);
}));
test('unsupported ESP32 target pins or changing mappings cannot be substituted into exact compiled source',()=>fixture(x=>{
 x.workspace.assignPins(x.w.id,x.link.id,pins());
 const replacement=pins('17','27','26');
 x.workspace.assignPins(x.w.id,x.link.id,replacement);
 assert.equal(x.workspace.reviewPins(x.w.id,x.link.id).status,'review');
 const review=inspect(x.workspace,x.w.id,x.link.id);
 assert.equal(review.eligible,false);
 assert.match(review.issues.join(' '),/compiled target UART pin route/);
 assert.throws(()=>exportPair(x.workspace,x.w.id,x.link.id,x.target),/UART export blocked/);
 assert.deepEqual(fs.readdirSync(x.target),[]);
}));
test('later GPIO occupation and competing plans deny dual ESP32 export',()=>fixture(x=>{
 x.workspace.assignPins(x.w.id,x.link.id,pins());
 const p=x.projects.open(x.b.id);
 p.peripherals=[{id:'taken25',type:'gpio',bus:'dev',pins:{io:'25'}}];
 x.projects.save(p);
 assert.equal(inspect(x.workspace,x.w.id,x.link.id).eligible,false);
 assert.match(inspect(x.workspace,x.w.id,x.link.id).issues.join(' '),/peripheral/);
 p.peripherals=[];x.projects.save(p);
 assert.equal(inspect(x.workspace,x.w.id,x.link.id).eligible,true);
 const third=x.projects.create('Third','esp32:esp32:esp32');
 x.workspace.add(x.w.id,third.id);
 const next=x.workspace.link(x.w.id,x.b.id,third.id,'uart').links.find(l=>l.id!==x.link.id);
 const json=JSON.parse(fs.readFileSync(x.workspace.filename,'utf8'));
 json.items[0].links.find(l=>l.id===next.id).pins=pins('25','18','19');
 fs.writeFileSync(x.workspace.filename,JSON.stringify(json));
 const newReview=inspect(x.workspace,x.w.id,x.link.id);
 assert.equal(newReview.eligible,false);
 assert.match(newReview.issues.join(' '),/another workspace link/);
 assert.deepEqual(fs.readdirSync(x.target),[]);
}));
test('ESP32 on both endpoints needs saved plan, and no-override rule survives second export variant',()=>fixture(x=>{
 assert.equal(inspect(x.workspace,x.w.id,x.link.id).eligible,false);
 x.workspace.assignPins(x.w.id,x.link.id,pins());
 const result=exportPair(x.workspace,x.w.id,x.link.id,x.target);
 const marker=path.join(result.folder,'owner.data');fs.writeFileSync(marker,'preserve');
 assert.throws(()=>exportPair(x.workspace,x.w.id,x.link.id,x.target),/Refusing to overwrite/);
 assert.equal(fs.readFileSync(marker,'utf8'),'preserve');
 assert.equal(fs.readdirSync(x.target).length,1);
}));
test('dedicated second ESP32 responder export script emits exact source and never overwrites',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-uart32-responder-'));
 try{
  const script=path.join(__dirname,'../scripts/export-uart-esp32-responder.cjs');
  const raw=execFileSync(process.execPath,[script,root],{encoding:'utf8'}),manifest=JSON.parse(raw);
  assert.deepEqual(manifest.gpio,{tx:'25',rx:'26'});
  assert.equal(manifest.fqbn,'esp32:esp32:esp32');
  assert.equal(manifest.physicalLinkVerified,false);
  assert.equal(manifest.hardwareFlashed,false);
  const output=path.join(root,esp32Responder.name);
  assert.equal(fs.readFileSync(path.join(output,esp32Responder.name+'.ino'),'utf8'),esp32Responder.source);
  assert.throws(()=>execFileSync(process.execPath,[script,root],{stdio:'pipe'}),e=>e.status!==0&&String(e.stderr).includes('Refusing to overwrite'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
