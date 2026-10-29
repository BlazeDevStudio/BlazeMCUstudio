'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const script=path.join(__dirname,'../scripts/export-uart-lab.cjs');
const header=fs.readFileSync(path.join(__dirname,'../core/firmware/BlazeUartFrame.h'),'utf8');
test('bounded framing protocol is inert, contains one PING/PONG handler and no relay or GPIO command APIs',()=>{
 for(const token of ['MAX_PAYLOAD=16','RX_TIMEOUT_MS=250','inline uint8_t crcByte','class Parser','inline bool makePong','static const uint8_t PING=1','static const uint8_t PONG=2'])
  assert(header.includes(token),token);
 assert.match(header,/if\(request.kind!=PING\|\|request.length>MAX_PAYLOAD\)return false/);
 assert(!/\b(?:digitalWrite|pinMode|analogWrite|attachInterrupt)\s*\(/.test(header));
 assert(!/\b(?:malloc|new\s+|std::vector|std::string)\b/.test(header));
});
test('UART lab exports two real Arduino sketches and local identical protocol headers, never overrides',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blaze-uart-lab-'));
 try{
  const output=execFileSync(process.execPath,[script,root],{encoding:'utf8'});
  const manifest=output.trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(manifest.map(m=>m.fqbn),['esp32:esp32:esp32','esp8266:esp8266:generic']);
  for(const m of manifest){
   const folder=path.join(root,m.name),source=fs.readFileSync(path.join(folder,m.name+'.ino'),'utf8');
   assert(source.includes('#include "BlazeUartFrame.h"'));
   assert(source.includes('receiver.feed('));
   assert(source.includes('Serial'));
   assert.equal(fs.readFileSync(path.join(folder,'BlazeUartFrame.h'),'utf8'),header);
   assert.equal(m.wireApproval,false);
   assert.equal(m.kind,'inert-ping-pong');
  }
  const initiator=fs.readFileSync(path.join(root,manifest[0].name,manifest[0].name+'.ino'),'utf8');
  const responder=fs.readFileSync(path.join(root,manifest[1].name,manifest[1].name+'.ino'),'utf8');
  assert(initiator.includes('Serial1.begin(9600,SERIAL_8N1,16,17)'));
  assert(responder.includes('Serial.begin(9600)'));
  assert(responder.includes('makePong(request,response)'));
  assert.throws(()=>execFileSync(process.execPath,[script,root],{stdio:'pipe'}),e=>e.status!==0&&String(e.stderr).includes('Refusing to overwrite'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
