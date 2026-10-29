'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WorkspaceStore}=require('../core/storage.cjs');
const {WorkspaceCatalog}=require('../core/workspaces.cjs');

function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-links-'));
 try{const ps=new WorkspaceStore(root),cat=new WorkspaceCatalog(ps);return fn(ps,cat,root);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('workspace planning persists independently of original firmware source/board identity',()=>fixture((ps,cat,root)=>{
 const uno=ps.create('Uno','arduino:avr:uno'),esp=ps.create('ESP32','esp32:esp32:esp32');
 const before=[fs.readFileSync(ps.filename(uno.id),'utf8'),fs.readFileSync(ps.filename(esp.id),'utf8')];
 const w=cat.create('Bench');cat.add(w.id,uno.id);cat.add(w.id,esp.id);
 const linked=cat.link(w.id,uno.id,esp.id,'uart');
 assert.equal(linked.links.length,1);
 assert.equal(linked.links[0].kind,'uart');
 assert.equal(cat.get(w.id).links[0].available,true);
 assert.equal(new WorkspaceCatalog(new WorkspaceStore(root)).get(w.id).links.length,1);
 assert.equal(fs.readFileSync(ps.filename(uno.id),'utf8'),before[0]);
 assert.equal(fs.readFileSync(ps.filename(esp.id),'utf8'),before[1]);
 cat.unlink(w.id,linked.links[0].id);
 assert.deepEqual(cat.get(w.id).links,[]);
}));
test('invalid endpoints, self loops, duplicate links and unreviewed transports rejected',()=>fixture((ps,cat)=>{
 const a=ps.create('A'),b=ps.create('B'),c=ps.create('C'),w=cat.create('Lab');
 cat.add(w.id,a.id);cat.add(w.id,b.id);
 assert.throws(()=>cat.link(w.id,a.id,a.id,'uart'),/Invalid/);
 assert.throws(()=>cat.link(w.id,a.id,c.id,'uart'),/Both devices/);
 assert.throws(()=>cat.link(w.id,a.id,b.id,'nuclear'),/Invalid/);
 assert.throws(()=>cat.link(w.id,'../escape',b.id,'uart'),/Invalid/);
 cat.link(w.id,a.id,b.id,'wifi');
 assert.throws(()=>cat.link(w.id,a.id,b.id,'wifi'),/already exists/);
 assert.equal(cat.get(w.id).links.length,1);
 assert.throws(()=>cat.unlink(w.id,c.id),/not found/);
}));
test('unlinked member removes its topology edges without deleting board projects',()=>fixture((ps,cat)=>{
 const a=ps.create('A'),b=ps.create('B'),w=cat.create('Group');
 cat.add(w.id,a.id);cat.add(w.id,b.id);cat.link(w.id,a.id,b.id,'custom');
 cat.remove(w.id,b.id);
 assert.deepEqual(cat.get(w.id).links,[]);
 assert.equal(ps.open(b.id).name,'B');
}));
test('trashed member remains a visibly unavailable planned link, then recovers',()=>fixture((ps,cat)=>{
 const a=ps.create('A'),b=ps.create('B'),w=cat.create('Group');
 cat.add(w.id,a.id);cat.add(w.id,b.id);cat.link(w.id,a.id,b.id,'spi');
 ps.trash(b.id);
 assert.equal(cat.get(w.id).links[0].available,false);
 ps.recover(b.id);
 assert.equal(cat.get(w.id).links[0].available,true);
}));
test('legacy catalog with no links continues to load; corrupt or dangling links fail closed',()=>fixture((ps,cat,root)=>{
 const a=ps.create('A'),b=ps.create('B'),w=cat.create('Group');cat.add(w.id,a.id);cat.add(w.id,b.id);
 const filename=path.join(root,'_workspaces.json');
 const data=JSON.parse(fs.readFileSync(filename,'utf8'));
 delete data.items[0].links;
 fs.writeFileSync(filename,JSON.stringify(data));
 assert.deepEqual(cat.get(w.id).links,[]);
 const link=cat.link(w.id,a.id,b.id,'i2c').links[0];
 const bad=JSON.parse(fs.readFileSync(filename,'utf8'));bad.items[0].links[0].to='11111111-1111-4111-8111-111111111111';
 fs.writeFileSync(filename,JSON.stringify(bad));
 assert.throws(()=>cat.list(),/Invalid workspace link/);
 assert.equal(ps.open(a.id).name,'A');
 assert.equal(ps.open(b.id).name,'B');
 assert.ok(link.id);
}));

test('assessment uses persisted endpoint board identity and fails closed after trash',()=>fixture((ps,cat)=>{
 const a=ps.create('Uno','arduino:avr:uno'),b=ps.create('ESP','esp32:esp32:esp32');
 const w=cat.create('Hardware');cat.add(w.id,a.id);cat.add(w.id,b.id);
 const link=cat.link(w.id,a.id,b.id,'uart').links[0];
 const warning=cat.assess(w.id,link.id);
 assert.equal(warning.status,'blocked');
 assert.equal(warning.safeToWire,false);
 assert.match(warning.errors.join(' '),/Logic-level mismatch/);
 assert.equal(ps.open(a.id).fqbn,'arduino:avr:uno');
 ps.trash(b.id);
 const missing=cat.assess(w.id,link.id);
 assert.equal(missing.status,'blocked');
 assert.match(missing.errors.join(' '),/unavailable/);
 assert.throws(()=>cat.assess(w.id,'../../escape'),/Invalid/);
 assert.throws(()=>cat.assess(w.id,a.id),/not found/);
}));
