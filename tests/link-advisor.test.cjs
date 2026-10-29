'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createProject}=require('../core/project.cjs');
const {analyzeLink}=require('../core/link-advisor.cjs');
const uno=()=>createProject('Uno','arduino:avr:uno');
const esp=()=>createProject('ESP32','esp32:esp32:esp32');
const esp8266=()=>createProject('ESP8266','esp8266:esp8266:generic');

test('Uno to ESP32 wired UART/I2C/SPI is blocked for a 5V/3.3V direct connection',()=>{
 for(const kind of ['uart','i2c','spi']){
  const r=analyzeLink(uno(),esp(),kind);
  assert.equal(r.status,'blocked');
  assert.equal(r.safeToWire,false);
  assert.equal(r.firmwareGenerated,false);
  assert.match(r.errors.join(' '),/5V logic.*3.3V logic/);
  assert(r.warnings.some(w=>/unverified/.test(w)));
 }
});
test('Same-family ESP wired planning is review-only, never an electrical or pin certification',()=>{
 for(const kind of ['uart','i2c','spi']){
  const r=analyzeLink(esp(),esp8266(),kind);
  assert.equal(r.status,'review',r.errors.join(';'));
  assert.deepEqual(r.errors,[]);
  assert.equal(r.safeToWire,false);
  assert.match(r.warnings.join(' '),/pin assignment/);
 }
});
test('Unknown board and missing radio profile fail closed',()=>{
 const unreviewed=createProject('New MCU','esp32:esp32:esp32s3');
 assert.equal(analyzeLink(unreviewed,esp(),'uart').status,'blocked');
 assert.equal(analyzeLink(unreviewed,esp(),'wifi').status,'blocked');
 assert.equal(analyzeLink(uno(),esp(),'wifi').status,'blocked');
});
test('ESP-NOW same-family is review-only; mixed-family remains blocked without tested interoperability',()=>{
 assert.equal(analyzeLink(esp(),esp(),'esp-now').status,'review');
 assert.equal(analyzeLink(esp(),esp8266(),'esp-now').status,'blocked');
 assert.match(analyzeLink(esp(),esp8266(),'esp-now').errors.join(' '),/Cross-family/);
});
test('Custom transport remains unknown, never automatically approved',()=>{
 const r=analyzeLink(uno(),uno(),'custom');
 assert.equal(r.status,'unknown');
 assert.equal(r.safeToWire,false);
 assert.throws(()=>analyzeLink(uno(),uno(),'illegal'),/Invalid/);
});
test('Existing project peripheral pin collision is surfaced as blocked',()=>{
 const a=esp(),b=esp();
 a.peripherals=[{id:'one',type:'gpio',bus:'G',pins:{io:'21'}},{id:'two',type:'gpio',bus:'G',pins:{io:'21'}}];
 const r=analyzeLink(a,b,'uart');
 assert.equal(r.status,'blocked');
 assert.match(r.errors.join(' '),/Pin 21 collision/);
});
test('Manual source uncertainty is disclosed without changing C++ source',()=>{
 const a=esp(),b=esp8266();
 a.source.mode='manual';a.source.manualSource='void setup(){} void loop(){}';
 const original=a.source.manualSource;
 const r=analyzeLink(a,b,'wifi');
 assert.equal(r.status,'review');
 assert(r.warnings.some(w=>/not reverse-analysed/.test(w)));
 assert.equal(a.source.manualSource,original);
});
