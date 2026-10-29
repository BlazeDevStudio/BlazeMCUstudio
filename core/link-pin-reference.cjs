'use strict';
// Pinout reference ONLY. This is not an electrical design, netlist, bus allocation or generated firmware.
// All listed pins refer to Arduino pin numbers/raw ESP GPIO, never carrier silk-screen D-labels.
const {profile,pinCheck}=require('./board.cjs');
const {plan}=require('./peripherals.cjs');
const {analyzeLink}=require('./link-advisor.cjs');
// References: Arduino Uno R3 official connector pinout, Espressif arduino-esp32 board CI pinout,
// and ESP8266 Arduino core reference. Defaults apply to a specific target, NOT arbitrary carriers.
const REFS=Object.freeze({
 'arduino:avr:uno':{
  uart:{tx:'1',rx:'0'},i2c:{sda:'A4',scl:'A5'},spi:{sck:'13',miso:'12',mosi:'11',cs:'10'},
  source:'https://docs.arduino.cc/hardware/uno-rev3/'
 },
 'esp8266:esp8266:generic':{
  uart:{tx:'1',rx:'3'},i2c:{sda:'4',scl:'5'},spi:{sck:'14',miso:'12',mosi:'13',cs:'15'},
  source:'https://arduino-esp8266.readthedocs.io/en/latest/reference.html'
 },
 'esp8266:esp8266:nodemcuv2':{
  uart:{tx:'1',rx:'3'},i2c:{sda:'4',scl:'5'},spi:{sck:'14',miso:'12',mosi:'13',cs:'15'},
  source:'https://arduino-esp8266.readthedocs.io/en/latest/reference.html'
 },
 'esp32:esp32:esp32':{
  uart:{tx:'1',rx:'3'},i2c:{sda:'21',scl:'22'},spi:{sck:'18',miso:'19',mosi:'23',cs:'5'},
  source:'https://github.com/espressif/arduino-esp32/blob/master/.github/CI_README.md'
 }
});
const WIRED=new Set(['uart','i2c','spi']);
function drives(signal,role){
 if(signal==='tx')return true;
 if(signal==='rx')return false;
 if(signal==='sda')return true;
 if(signal==='scl'||signal==='sck'||signal==='mosi'||signal==='cs')return role==='controller';
 if(signal==='miso')return role==='peripheral';
 return false;
}
const CLAIM_TYPES=new Set(['pinMode','digitalWrite','pwmWrite','readAnalog','thresholdOutput']);
function activePins(p){
 const pins=new Set();
 if(p.visualMode==='flowchart'){
  const walk=steps=>{for(const n of steps||[]){
   if(['branch','write','setOutput'].includes(n.type)&&n.params?.pin!=null)pins.add(String(n.params.pin));
   walk(n.thenSteps);walk(n.elseSteps);
  }};
  walk(p.flowchart?.steps);
  const callsNodes=steps=>(steps||[]).some(n=>n.type==='callNodes'||callsNodes(n.thenSteps)||callsNodes(n.elseSteps));
  if(callsNodes(p.flowchart?.steps))for(const n of p.graph?.nodes||[])
   if(CLAIM_TYPES.has(n.type)&&n.params?.pin!=null)pins.add(String(n.params.pin));
 }else for(const n of p.graph?.nodes||[])if(CLAIM_TYPES.has(n.type)&&n.params?.pin!=null)pins.add(String(n.params.pin));
 return pins;
}
function referencePins(from,to,kind,orientation='source-controller'){
 if(!from||!to||typeof from!=='object'||typeof to!=='object'||typeof kind!=='string'
   ||!['source-controller','target-controller'].includes(orientation))throw Error('Invalid pin-reference request');
 const advice=analyzeLink(from,to,kind);
 const errors=[...advice.errors],warnings=[...advice.warnings];
 if(!WIRED.has(kind))return {
  ...advice,status:advice.status==='blocked'?'blocked':'unknown',orientation,
  source:null,target:null,errors,warnings:[...new Set([...warnings,'No physical pin reference is defined for this transport'])]
 };
 const a=REFS[from.fqbn],b=REFS[to.fqbn];
 if(!a||!b)errors.push('No documented default pins for at least one selected board; do not substitute other SoC pinouts');
 const describe=(project,ref,label,role)=>{
  if(!ref)return null;
  const pins={...ref[kind]},board=profile(project.fqbn);
  if(!board){errors.push(label+': board profile missing');return null;}
  const used=activePins(project);
  let peripheralPins=[];
  try{peripheralPins=plan(project).assignments.filter(x=>x.id!=='active-logic').map(x=>x.pin);}
  catch(e){errors.push(label+': cannot check existing project peripheral assignments: '+e.message);}
  for(const [signal,pin] of Object.entries(pins)){
   if(!board.pins.includes(pin)&&!board.analog.includes(pin))errors.push(label+': '+signal+' pin '+pin+' is not in curated pinout');
   if(board.blocked.includes(pin))errors.push(label+': '+signal+' pin '+pin+' is reserved for flash');
   if(board.inputOnly.includes(pin)&&drives(signal,role))errors.push(label+': '+signal+' requires output but pin '+pin+' is input-only');
   if(used.has(pin))errors.push(label+': '+signal+' pin '+pin+' is already used by active firmware logic');
   if(peripheralPins.includes(pin))errors.push(label+': '+signal+' pin '+pin+' is assigned to an existing peripheral');
   if(board.bootSensitive.includes(pin))warnings.push(label+': '+signal+' GPIO '+pin+' is bootstrapping-sensitive; attached circuits can break boot');
   if(kind==='uart'&&board.serial.includes(pin))warnings.push(label+': UART pin '+pin+' may share USB programming/debug serial');
   if(pin.startsWith('A'))warnings.push(label+': '+signal+' '+pin+' uses the Uno analog/I²C connector identity');
  }
  return {fqbn:project.fqbn,role,pins,source:ref.source};
 };
 const sourceRole=kind==='uart'?'peer':orientation==='source-controller'?'controller':'peripheral';
 const targetRole=kind==='uart'?'peer':orientation==='source-controller'?'peripheral':'controller';
 const source=describe(from,a,'Source',sourceRole),target=describe(to,b,'Target',targetRole);
 if(kind==='uart')warnings.push('Cross TX→RX and RX←TX after independent voltage and connector review; do not connect directly from this reference');
 if(kind==='i2c')warnings.push('Controller/peripheral firmware support, 7-bit addressing, pull-up rail and resistor values must be reviewed');
 if(kind==='spi')warnings.push('Controller/peripheral firmware support, chip-select routing, voltage and clock compatibility must be reviewed');
 warnings.push('These are reference default pins, NOT installed wiring or verified connector/pin ownership');
 return {...advice,orientation,source,target,status:errors.length?'blocked':'review',
  errors:[...new Set(errors)],warnings:[...new Set(warnings)],safeToWire:false,firmwareGenerated:false};
}
module.exports={REFS,referencePins,activePins};
