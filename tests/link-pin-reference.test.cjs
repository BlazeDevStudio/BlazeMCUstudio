'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createProject}=require('../core/project.cjs');
const {referencePins,REFS}=require('../core/link-pin-reference.cjs');
const uno=()=>createProject('Uno','arduino:avr:uno');
const e32=()=>createProject('ESP32','esp32:esp32:esp32');
const e8266=()=>createProject('ESP8266','esp8266:esp8266:generic');

test('curated Uno UART and ESP32 UART references match explicit GPIO numbering',()=>{
 const a=uno(),b=e32();const before=JSON.stringify([a,b]);
 const out=referencePins(a,b,'uart');
 assert.deepEqual(out.source.pins,{tx:'1',rx:'0'});
 assert.deepEqual(out.target.pins,{tx:'1',rx:'3'});
 assert.equal(out.source.role,'peer');assert.equal(out.target.role,'peer');
 assert.equal(out.status,'blocked'); // 5 V Uno / 3.3 V ESP32 may not be directly wired
 assert.equal(out.safeToWire,false);assert.equal(out.firmwareGenerated,false);
 assert.equal(JSON.stringify([a,b]),before);
 assert.match(out.errors.join(' '),/Logic-level mismatch/);
 assert(out.warnings.some(x=>/USB programming/.test(x)));
});
test('SPI reference distinguishes source controller and target peripheral without auto assigning pins',()=>{
 const a=e32(),b=e8266();
 const normal=referencePins(a,b,'spi','source-controller');
 assert.deepEqual(normal.source.pins,{sck:'18',miso:'19',mosi:'23',cs:'5'});
 assert.deepEqual(normal.target.pins,{sck:'14',miso:'12',mosi:'13',cs:'15'});
 assert.equal(normal.source.role,'controller');assert.equal(normal.target.role,'peripheral');
 assert.equal(normal.status,'review');
 assert(normal.warnings.some(x=>/bootstrapping-sensitive/.test(x)));
 const swapped=referencePins(a,b,'spi','target-controller');
 assert.equal(swapped.source.role,'peripheral');assert.equal(swapped.target.role,'controller');
 assert.equal(swapped.safeToWire,false);
});
test('I2C on ESP32 default blink pin is blocked by active firmware ownership',()=>{
 const r=referencePins(e32(),e8266(),'i2c');
 assert.equal(r.status,'blocked');
 assert.match(r.errors.join(' '),/Source: sda pin 21 is already used/);
 assert.match(r.errors.join(' '),/Target: sda pin 4 is already used/);
});
test('I2C Uno A4/A5 pin roles are retained as connector reference, not arbitrary digital GPIO',()=>{
 const r=referencePins(uno(),e32(),'i2c');
 assert.equal(r.source.pins.sda,'A4');assert.equal(r.source.pins.scl,'A5');
 assert.equal(r.status,'blocked');
 assert.equal(r.safeToWire,false);
});
test('unreviewed ESP32 S3 board has no borrowed classic ESP32 GPIO reference',()=>{
 const a=createProject('ESP32S3','esp32:esp32:esp32s3'),b=e32();
 const r=referencePins(a,b,'spi');
 assert.equal(r.status,'blocked');assert.equal(r.source,null);
 assert(r.errors.some(x=>/No documented default pins/.test(x)));
 assert.equal(REFS[a.fqbn],undefined);
});
test('wireless and custom transports never offer fictitious physical pin references',()=>{
 for(const kind of ['wifi','esp-now','custom']){
  const r=referencePins(e32(),e8266(),kind);
  assert.equal(r.source,null);assert.equal(r.target,null);assert.equal(r.safeToWire,false);
  assert(r.warnings.some(x=>/No physical pin reference/.test(x)));
 }
});
test('already reserved peripheral pin blocks reference rather than silently claiming it',()=>{
 const a=e32(),b=e8266();
 a.peripherals=[{id:'externalUART',type:'gpio',bus:'ext',pins:{io:'1'}}];
 const r=referencePins(a,b,'uart');
 assert.equal(r.status,'blocked');assert.match(r.errors.join(' '),/Source: tx pin 1 is assigned/);
 assert.equal(a.peripherals[0].pins.io,'1');
});
test('input does not accept arbitrary orientation or malformed project',()=>{
 assert.throws(()=>referencePins(e32(),e8266(),'spi','wrong'),/Invalid pin-reference/);
 assert.throws(()=>referencePins(null,e8266(),'spi'),/Invalid pin-reference/);
});
