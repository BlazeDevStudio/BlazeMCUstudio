'use strict';
// Advisory only: no generated wire harness, voltage approval, protocol firmware, or pin allocation.
// Curated board profiles cover chip-family GPIO, not every carrier, shield or attached radio.
const {profile}=require('./board.cjs');
const {plan}=require('./peripherals.cjs');
const TRANSPORTS=new Set(['uart','i2c','spi','wifi','esp-now','custom']);
const WIRED=new Set(['uart','i2c','spi']);
function family(fqbn){
 if(typeof fqbn!=='string')return 'unknown';
 if(fqbn==='arduino:avr:uno')return 'uno';
 if(fqbn.startsWith('esp8266:esp8266:'))return 'esp8266';
 if(fqbn==='esp32:esp32:esp32')return 'esp32';
 return 'unknown';
}
function voltage(model){
 const match=String(model?.voltage||'').match(/^(3\.3|5)V logic$/);
 return match?Number(match[1]):null;
}
function analyzeLink(from,to,kind){
 if(!from||!to||typeof from!=='object'||typeof to!=='object'||!TRANSPORTS.has(kind))
  throw Error('Invalid device-link assessment');
 const a=profile(from.fqbn),b=profile(to.fqbn);
 const fa=family(from.fqbn),fb=family(to.fqbn);
 const errors=[],warnings=[];
 if(!a||!b)errors.push('At least one target has no curated board profile; cannot assess this connection');
 if(kind==='custom')warnings.push('Custom transport has no reviewed protocol or wiring model');
 if(WIRED.has(kind)){
  warnings.push('No connector, signal direction, pin assignment, shared ground or board-carrier wiring has been verified');
  const va=voltage(a),vb=voltage(b);
  if(va!==null&&vb!==null&&va!==vb)
   errors.push('Logic-level mismatch ('+a.voltage+' ↔ '+b.voltage+'): direct signal wiring is NOT approved; independently review level shifting, power and direction');
  else if(va===null||vb===null)errors.push('Logic-level voltage is unverified for at least one endpoint');
  if(kind==='uart')warnings.push('UART TX/RX crossover, available hardware port, USB serial contention, baud rate and shared ground remain unverified');
  if(kind==='i2c')warnings.push('I²C controller/peripheral roles, pull-up rail, SDA/SCL mapping, addresses, bus capacitance and clock remain unverified');
  if(kind==='spi')warnings.push('SPI controller/peripheral roles, independent CS lines, SPI mode, clock and voltage remain unverified');
 }
 if(kind==='wifi'||kind==='esp-now'){
  if(!['esp8266','esp32'].includes(fa)||!['esp8266','esp32'].includes(fb))
   errors.push('Wireless transport needs separately verified radio hardware/adapter on each target; curated profiles do not establish it');
  else if(kind==='esp-now'&&fa!==fb)
   errors.push('Cross-family ESP-NOW pairing is not admitted without an independently tested protocol/SDK compatibility fixture');
  warnings.push('Radio firmware, peer discovery, credentials, encryption, channel coexistence, range and throughput are not tested');
 }
 // Existing in-project peripheral conflicts also block endorsement of the overall plan.
 for(const [name,p] of [['Source',from],['Target',to]]){
  if(p?.source?.mode==='manual')warnings.push(name+' manual C++ source was not reverse-analysed for pin ownership');
  try{
   const result=plan(p);
   if(!result.ok)for(const error of result.errors)errors.push(name+' project resource conflict: '+error);
   for(const warn of result.warnings.slice(0,4))warnings.push(name+' project: '+warn);
  }catch(e){errors.push(name+' project resource configuration could not be assessed: '+String(e.message||e));}
 }
 warnings.push('Compilation and this report do not establish electrical safety or communication interoperability');
 const status=errors.length?'blocked':kind==='custom'?'unknown':'review';
 return {
  status,
  safeToWire:false,
  firmwareGenerated:false,
  fromFqbn:String(from.fqbn||'Unknown'),
  toFqbn:String(to.fqbn||'Unknown'),
  kind,
  errors:[...new Set(errors)],
  warnings:[...new Set(warnings)],
  provenance:[a?.sourceUrl,b?.sourceUrl].filter(Boolean)
 };
}
module.exports={analyzeLink};
