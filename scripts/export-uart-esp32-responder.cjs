#!/usr/bin/env node
'use strict';
// Generate the second ESP32-only UART1 example from the exact audited firmware template.
const fs=require('node:fs'),path=require('node:path');
const {esp32Responder}=require('../core/uart-pair-sketches.cjs');
const root=process.argv[2];
if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())
 throw Error('Provide an existing output parent folder');
const folder=path.join(root,esp32Responder.name);
if(fs.existsSync(folder))throw Error('Refusing to overwrite existing ESP32 UART responder');
fs.mkdirSync(folder);
try{
 fs.writeFileSync(path.join(folder,esp32Responder.name+'.ino'),esp32Responder.source,'utf8');
 fs.writeFileSync(path.join(folder,'BlazeUartFrame.h'),
  fs.readFileSync(path.join(__dirname,'../core/firmware/BlazeUartFrame.h'),'utf8'),'utf8');
 console.log(JSON.stringify({name:esp32Responder.name,fqbn:esp32Responder.fqbn,
  gpio:{tx:'25',rx:'26'},file:path.join(folder,esp32Responder.name+'.ino'),
  physicalLinkVerified:false,hardwareFlashed:false}));
}catch(err){fs.rmSync(folder,{recursive:true,force:true});throw err;}
