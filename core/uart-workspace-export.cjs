'use strict';
/* Explicit export of one reviewed saved workspace UART link into a NEW lab-only folder.
 * Never touches stored project source or workspace data, never invokes a compiler/flasher.
 * No "safe to wire" or remote control claims; only inert PING/PONG is emitted.
 */
const fs=require('node:fs');
const path=require('node:path');
const {demos,esp32Responder}=require('./uart-pair-sketches.cjs');
const EXPECTED=Object.freeze({
 source:Object.freeze({tx:'17',rx:'16'}),
 target:Object.freeze({tx:'1',rx:'3'})
});
const SOURCE_BOARD='esp32:esp32:esp32';
const TARGET_BOARD='esp8266:esp8266:generic';
const ESP32_BOARD='esp32:esp32:esp32';
// Deliberately bounded, per-target Arduino HardwareSerial pin routing.
// Only these sources were independently compiled; no arbitrary GPIO mux claims.
const PAIRS=Object.freeze({
 [TARGET_BOARD]:Object.freeze({
  id:'esp32-to-esp8266',source:EXPECTED.source,
  target:EXPECTED.target,serial:'ESP8266 UART0 (shared with USB programming)',
  sketches:Object.freeze([demos[0],demos[1]])
 }),
 [ESP32_BOARD]:Object.freeze({
  id:'dual-esp32-uart1',source:EXPECTED.source,
  target:Object.freeze({tx:'25',rx:'26'}),serial:'ESP32 UART1 RX26/TX25',
  sketches:Object.freeze([demos[0],esp32Responder])
 })
});
const WARNING='Lab-only UART examples. Physical wiring, voltage, connector, USB serial contention, communication and authentication are NOT verified.';
function matches(actual,wanted){
 return !!actual&&Object.keys(wanted).every(k=>actual[k]===wanted[k])
  &&Object.keys(actual).length===Object.keys(wanted).length;
}
function inspect(catalog,workspaceId,linkId){
 const w=catalog.get(workspaceId),link=(w.links||[]).find(l=>l.id===linkId);
 if(!link)throw Error('Planned workspace link not found');
 const issues=[];
 if(link.kind!=='uart')issues.push('Only UART links support this lab export');
 if(!link.pins)issues.push('Save an explicit source and target UART pin map first');
 let source,target,review;
 if(link.kind==='uart'&&link.pins){
  review=catalog.reviewPins(workspaceId,linkId);
  if(review.status!=='review')issues.push(...(review.errors?.length?review.errors:['Current signal plan is unavailable or blocked']));
  try{source=catalog.projects.open(link.from);target=catalog.projects.open(link.to);}
  catch{issues.push('One saved endpoint project is missing, corrupt or in recovery');}
 }
 const pair=source?.fqbn===SOURCE_BOARD?PAIRS[target?.fqbn]:null;
 if(source&&target){
  if(!pair)
   issues.push('Only ESP32 UART1 source to ESP8266 Generic or classic ESP32 UART1 target is compiled in this bounded lab');
  if(source.source?.mode!=='visual'||target.source?.mode!=='visual')
   issues.push('Manual firmware projects are not eligible for this separate lab export');
  if(pair&&(!matches(link.pins?.source,pair.source)||!matches(link.pins?.target,pair.target)))
   issues.push('This lab only supports source ESP32 UART1 TX17/RX16 and the compiled target UART pin route ('+pair.serial+')');
 }
 const details={
  workspaceId,linkId,sourceProjectId:link.from,targetProjectId:link.to,
  sourceFqbn:source?.fqbn||null,targetFqbn:target?.fqbn||null,
  kind:link.kind,variant:pair?.id||null,status:issues.length?'blocked':'review',
  eligible:issues.length===0,issues:[...new Set(issues)],
  selectedPins:link.pins?structuredClone(link.pins):null,
  output:'separate lab firmware only',wireApproval:false,flashed:false,
  connected:false,firmwareModified:false,warnings:[WARNING]
 };
 return details;
}
function exportPair(catalog,workspaceId,linkId,parent){
 // Rechecks current project state here, not merely a potentially stale UI preview.
 const review=inspect(catalog,workspaceId,linkId);
 if(!review.eligible)throw Error('UART export blocked: '+review.issues.join('; '));
 if(typeof parent!=='string'||!parent||!fs.statSync(parent).isDirectory())
  throw Error('Select an existing output folder');
 const root=path.resolve(parent),basename='BlazeUartLab-'+linkId.slice(0,8);
 const dest=path.join(root,basename);
 if(fs.existsSync(dest))throw Error('Refusing to overwrite existing UART lab folder: '+dest);
 const staging=fs.mkdtempSync(path.join(root,'.blaze-uart-stage-'));
 try{
  const header=fs.readFileSync(path.join(__dirname,'firmware/BlazeUartFrame.h'),'utf8');
  const selected=PAIRS[review.targetFqbn];
  if(!selected||review.variant!==selected.id)throw Error('Unsupported UART export target variant');
  for(const demo of selected.sketches){
   const folder=path.join(staging,demo.name);fs.mkdirSync(folder);
   fs.writeFileSync(path.join(folder,demo.name+'.ino'),demo.source,'utf8');
   fs.writeFileSync(path.join(folder,'BlazeUartFrame.h'),header,'utf8');
  }
  const manifest={
   schemaVersion:1,format:'blaze-uart-lab',kind:'uart',
   workspaceId:review.workspaceId,linkId:review.linkId,
   sourceProjectId:review.sourceProjectId,targetProjectId:review.targetProjectId,
   sourceFqbn:review.sourceFqbn,targetFqbn:review.targetFqbn,
   pins:review.selectedPins,provenance:'reviewed persisted workspace link',
   variant:review.variant,
   uartRouting:{source:'ESP32 UART1 RX16/TX17',target:selected.serial},
   sketches:selected.sketches.map(d=>({folder:d.name,fqbn:d.fqbn})),
   wireApproval:false,flashed:false,connected:false,firmwareModified:false,
   warning:WARNING
  };
  fs.writeFileSync(path.join(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(staging,'READ_ME_FIRST.txt'),
   'INERT UART PING/PONG LAB ONLY\n'+WARNING+'\n'+
   'This export does not modify original projects or upload to any MCU.\n'+
   'GPIO numbers are NOT physical wiring instructions.\n','utf8');
  // Destination race check; rename must not intentionally overwrite user files.
  if(fs.existsSync(dest))throw Error('Output folder appeared during export; refusing overwrite');
  fs.renameSync(staging,dest);
  return {folder:dest,manifest:path.join(dest,'manifest.json'),
   sketches:manifest.sketches.map(x=>x.folder),wireApproval:false,
   flashed:false,connected:false,sourceProjectsModified:false};
 }finally{if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true});}
}
module.exports={EXPECTED,SOURCE_BOARD,TARGET_BOARD,ESP32_BOARD,PAIRS,inspect,exportPair};
