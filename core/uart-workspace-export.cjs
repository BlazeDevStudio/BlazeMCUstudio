'use strict';

// Lab-source export only. Saved projects and workspace links are read, not edited.
// All eligible routes are exact, independently compiled PING/PONG sketches.
const fs=require('node:fs');
const path=require('node:path');
const {ESP32,ESP8266,SKETCHES}=require('./uart-pair-sketches.cjs');
const {outputRoot,exportSketches}=require('./uart-sketch-output.cjs');

const SOURCE_BOARD=ESP32;
const TARGET_BOARD=ESP8266;
const ESP32_BOARD=ESP32;
const EXPECTED=Object.freeze({
 source:Object.freeze({tx:'17',rx:'16'}),
 target:Object.freeze({tx:'1',rx:'3'})
});
const WARNING='Lab-only UART examples. Physical wiring, voltage, connector, USB serial contention, communication and authentication are NOT verified.';

// A target board never implies arbitrary serial-routing support: only the
// listed GPIO routes have been compiled into their matching sketch sources.
const PAIRS=Object.freeze({
 [ESP8266]:Object.freeze({
  id:'esp32-to-esp8266',source:EXPECTED.source,target:EXPECTED.target,
  serial:'ESP8266 UART0 (shared with USB programming)',
  sketches:Object.freeze([SKETCHES.esp32Initiator,SKETCHES.esp8266Responder])
 }),
 [ESP32]:Object.freeze({
  id:'dual-esp32-uart1',source:EXPECTED.source,
  target:Object.freeze({tx:'25',rx:'26'}),
  serial:'ESP32 UART1 RX26/TX25',
  sketches:Object.freeze([SKETCHES.esp32Initiator,SKETCHES.esp32Responder])
 })
});

function exactPins(actual,expected){
 return !!actual&&Object.keys(actual).length===Object.keys(expected).length
  &&Object.entries(expected).every(([signal,pin])=>actual[signal]===pin);
}

function inspect(catalog,workspaceId,linkId){
 const workspace=catalog.get(workspaceId);
 const link=(workspace.links||[]).find(item=>item.id===linkId);
 if(!link)throw Error('Planned workspace link not found');

 const issues=[];
 if(link.kind!=='uart')issues.push('Only UART links support this lab export');
 if(!link.pins)issues.push('Save an explicit source and target UART pin map first');

 let source,target;
 if(link.kind==='uart'&&link.pins){
  const current=catalog.reviewPins(workspaceId,linkId);
  if(current.status!=='review')
   issues.push(...(current.errors?.length?current.errors:['Current signal plan is unavailable or blocked']));
  try{
   source=catalog.projects.open(link.from);
   target=catalog.projects.open(link.to);
  }catch{
   issues.push('One saved endpoint project is missing, corrupt or in recovery');
  }
 }

 const pair=source?.fqbn===SOURCE_BOARD?PAIRS[target?.fqbn]:null;
 if(source&&target){
  if(!pair)
   issues.push('Only ESP32 UART1 source to ESP8266 Generic or classic ESP32 UART1 target is compiled in this bounded lab');
  if(source.source?.mode!=='visual'||target.source?.mode!=='visual')
   issues.push('Manual firmware projects are not eligible for this separate lab export');
  if(pair&&(!exactPins(link.pins?.source,pair.source)||!exactPins(link.pins?.target,pair.target)))
   issues.push('This lab only supports ESP32 UART1 source TX17/RX16 and the compiled target UART pin route ('+pair.serial+')');
 }
 const uniqueIssues=[...new Set(issues)];
 return {
  workspaceId,linkId,sourceProjectId:link.from,targetProjectId:link.to,
  sourceFqbn:source?.fqbn||null,targetFqbn:target?.fqbn||null,
  kind:link.kind,variant:pair?.id||null,
  status:uniqueIssues.length?'blocked':'review',eligible:uniqueIssues.length===0,
  issues:uniqueIssues,selectedPins:link.pins?structuredClone(link.pins):null,
  output:'separate lab firmware only',wireApproval:false,flashed:false,
  connected:false,firmwareModified:false,warnings:[WARNING]
 };
}

function exportPair(catalog,workspaceId,linkId,parent){
 // Do not trust a stale GUI preview; resolve and check the saved project again.
 const review=inspect(catalog,workspaceId,linkId);
 if(!review.eligible)throw Error('UART export blocked: '+review.issues.join('; '));

 const root=outputRoot(parent);
 const destination=path.join(root,'BlazeUartLab-'+linkId.slice(0,8));
 if(fs.existsSync(destination))
  throw Error('Refusing to overwrite existing UART lab folder: '+destination);

 const pair=PAIRS[review.targetFqbn];
 if(!pair||pair.id!==review.variant)throw Error('Unsupported UART export target variant');
 const staging=fs.mkdtempSync(path.join(root,'.blaze-uart-stage-'));
 try{
  const sketches=exportSketches(staging,pair.sketches);
  const manifest={
   schemaVersion:1,format:'blaze-uart-lab',kind:'uart',
   workspaceId:review.workspaceId,linkId:review.linkId,
   sourceProjectId:review.sourceProjectId,targetProjectId:review.targetProjectId,
   sourceFqbn:review.sourceFqbn,targetFqbn:review.targetFqbn,
   pins:review.selectedPins,provenance:'reviewed persisted workspace link',
   variant:review.variant,
   uartRouting:{source:'ESP32 UART1 RX16/TX17',target:pair.serial},
   sketches:sketches.map(item=>({folder:item.name,fqbn:item.fqbn})),
   wireApproval:false,flashed:false,connected:false,firmwareModified:false,
   warning:WARNING
  };
  fs.writeFileSync(path.join(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(staging,'READ_ME_FIRST.txt'),
   'INERT UART PING/PONG LAB ONLY\n'+WARNING+'\n'+
   'This export does not modify original projects or upload to any MCU.\n'+
   'GPIO numbers are NOT physical wiring instructions.\n','utf8');

  // A second check reduces collisions with a concurrently created directory.
  // We do NOT call a rename-and-replace operation on an intentionally existing path.
  if(fs.existsSync(destination))
   throw Error('Output folder appeared during export; refusing overwrite');
  fs.renameSync(staging,destination);
  return {
   folder:destination,manifest:path.join(destination,'manifest.json'),
   sketches:manifest.sketches.map(item=>item.folder),
   wireApproval:false,flashed:false,connected:false,sourceProjectsModified:false
  };
 }finally{
  if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true});
 }
}

module.exports={EXPECTED,SOURCE_BOARD,TARGET_BOARD,ESP32_BOARD,PAIRS,inspect,exportPair};
