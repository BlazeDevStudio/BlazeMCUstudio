'use strict';
// User-entered signal selections are planning metadata, never approved electrical nets.
// Persisted in workspace catalog only; project firmware and pin reservations remain unchanged.
const {profile}=require('./board.cjs');
const {plan}=require('./peripherals.cjs');
const {activePins,REFS}=require('./link-pin-reference.cjs');
const {analyzeLink}=require('./link-advisor.cjs');
const ROLES=Object.freeze({uart:['tx','rx'],i2c:['sda','scl'],spi:['sck','miso','mosi','cs']});
const PIN=/^(?:[0-9]{1,3}|A[0-5])$/;
const validObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const identical=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
function parseShape(kind,input){
 const signals=ROLES[kind];
 if(!signals||!validObject(input)||!identical(Object.keys(input),['orientation','source','target'])
  ||!['source-controller','target-controller'].includes(input.orientation))
  throw Error('Invalid link signal assignment shape');
 const pins={orientation:input.orientation};
 for(const endpoint of ['source','target']){
  const side=input[endpoint];
  if(!validObject(side)||!identical(Object.keys(side),signals))
   throw Error('Incomplete or unexpected '+endpoint+' signal assignments');
  pins[endpoint]={};
  for(const signal of signals){
   if(typeof side[signal]!=='string'||!PIN.test(side[signal]))
    throw Error('Invalid '+endpoint+' '+signal+' pin number');
   pins[endpoint][signal]=side[signal];
  }
 }
 return pins;
}
function drives(signal,role){
 if(signal==='tx'||signal==='sda')return true;
 if(['sck','mosi','cs'].includes(signal))return role==='controller';
 if(signal==='miso')return role==='peripheral';
 return false;
}
function checkPins(from,to,kind,input,reserved={}){
 const pins=parseShape(kind,input),warnings=[],errors=[];
 const advice=analyzeLink(from,to,kind);
 if(advice.status==='blocked')errors.push(...advice.errors.map(e=>'Existing link blocker: '+e));
 const roles=kind==='uart'?['peer','peer']:
  pins.orientation==='source-controller'?['controller','peripheral']:['peripheral','controller'];
 for(const [n,side] of ['source','target'].entries()){
  const p=side==='source'?from:to,board=profile(p.fqbn),values=pins[side];
  if(!board){errors.push(side+': unreviewed board pin profile');continue;}
  const used=activePins(p);
  let planned=[];
  try{
   const current=plan(p);
   if(!current.ok)errors.push(...current.errors.map(e=>side+' project: '+e));
   planned=current.assignments.filter(x=>x.id!=='active-logic').map(x=>x.pin);
  }catch(e){errors.push(side+': invalid resource plan: '+String(e.message||e));}
  const occupied=new Set(reserved[side]||[]);
  const seen=new Set();
  for(const [signal,pin] of Object.entries(values)){
   if(seen.has(pin))errors.push(side+': signals cannot share GPIO '+pin);
   seen.add(pin);
   if(!board.pins.includes(pin)&&!board.analog.includes(pin))errors.push(side+': '+pin+' is not in the curated board pin list');
   if(board.blocked.includes(pin))errors.push(side+': '+pin+' is reserved or unavailable');
   if(board.inputOnly.includes(pin)&&drives(signal,roles[n]))errors.push(side+': '+signal+' requires output but '+pin+' is input-only');
   if(used.has(pin))errors.push(side+': '+signal+' GPIO '+pin+' is owned by active firmware logic');
   if(planned.includes(pin))errors.push(side+': '+signal+' GPIO '+pin+' is reserved by a project peripheral');
   if(occupied.has(pin))errors.push(side+': '+signal+' GPIO '+pin+' is already selected by another workspace link');
   if(board.bootSensitive.includes(pin))warnings.push(side+': GPIO '+pin+' is bootstrapping-sensitive');
   if(kind==='uart'&&board.serial.includes(pin))warnings.push(side+': UART GPIO '+pin+' may be used by USB programming or serial debug');
   // Only accept documented fixed signal routes for Uno and ESP8266 UART.
   const fixed=REFS[p.fqbn]?.[kind]?.[signal];
   if(fixed&&((p.fqbn==='arduino:avr:uno'&&signal!=='cs')
    ||(p.fqbn.startsWith('esp8266:')&&kind==='uart'))&&pin!==fixed)
    errors.push(side+': '+signal+' requires documented '+fixed+' on '+p.fqbn+' in this limited planner');
  }
  if(p.source?.mode==='manual')warnings.push(side+': manual C++ pin usage cannot be completely inferred');
 }
 warnings.push('Selections are not verified physical connector pins or approved wiring');
 warnings.push('Pin selections are not written into firmware or compiled protocol drivers');
 return {pins,errors:[...new Set(errors)],warnings:[...new Set(warnings)],
  status:errors.length?'blocked':'review',safeToWire:false,firmwareGenerated:false};
}
module.exports={ROLES,parseShape,checkPins};
