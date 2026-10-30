#!/usr/bin/env node
'use strict';
// Export bounded, inert UART ping/pong lab sketches. NEVER flash or auto-wire.
// Source pin values reflect only the exact curated example FQBNs.
const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2];
if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('Provide an existing output parent directory');
const header=fs.readFileSync(path.join(__dirname,'../core/firmware/BlazeUartFrame.h'),'utf8');

const {demos}=require('../core/uart-pair-sketches.cjs');

for(const {name,fqbn,source} of demos){
 const dir=path.join(root,name);
 if(fs.existsSync(dir))throw Error('Refusing to overwrite existing UART lab demo: '+dir);
 fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,name+'.ino'),source,'utf8');
 fs.writeFileSync(path.join(dir,'BlazeUartFrame.h'),header,'utf8');
 console.log(JSON.stringify({name,fqbn,sketch:path.join(dir,name+'.ino'),header:'BlazeUartFrame.h',kind:'inert-ping-pong',wireApproval:false}));
}
