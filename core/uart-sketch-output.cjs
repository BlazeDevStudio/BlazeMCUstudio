'use strict';

// Single filesystem boundary for lab sketch source exports.
// This module creates Arduino source files only. It never invokes a compiler,
// serial device, flasher or process, nor does it modify persisted IDE projects.
const fs=require('node:fs');
const path=require('node:path');

const VALID_NAME=/^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const HEADER_PATH=path.join(__dirname,'firmware','BlazeUartFrame.h');

function outputRoot(parent) {
 if(typeof parent!=='string'||!parent.trim())
  throw Error('Select an existing output folder');
 try {
  if(!fs.statSync(parent).isDirectory())throw Error('Not a directory');
 }catch{
  throw Error('Select an existing output folder');
 }
 return path.resolve(parent);
}

function exportSketches(parent,sketches,{collisionLabel='UART lab demo'}={}){
 const root=outputRoot(parent);
 if(!Array.isArray(sketches)||sketches.length<1||sketches.length>3)
  throw Error('Expected 1–3 UART lab sketches');
 const names=new Set();
 for(const sketch of sketches){
  if(!sketch||!VALID_NAME.test(sketch.name)||typeof sketch.source!=='string'
   ||typeof sketch.fqbn!=='string'||names.has(sketch.name))
   throw Error('Invalid or duplicate UART sketch definition');
  names.add(sketch.name);
 }
 // Reject all known output collisions before creating anything. mkdir below
 // separately guards a destination created after this check.
 for(const {name} of sketches){
  if(fs.existsSync(path.join(root,name)))
   throw Error('Refusing to overwrite existing '+collisionLabel+': '+path.join(root,name));
 }
 const header=fs.readFileSync(HEADER_PATH,'utf8');
 const created=[];
 try{
  for(const {name,source,fqbn} of sketches){
   const dir=path.join(root,name);
   try{fs.mkdirSync(dir);}
   catch(e){
    if(e.code==='EEXIST')throw Error('Refusing to overwrite existing '+collisionLabel+': '+dir);
    throw e;
   }
   created.push(dir);
   fs.writeFileSync(path.join(dir,name+'.ino'),source,'utf8');
   fs.writeFileSync(path.join(dir,'BlazeUartFrame.h'),header,'utf8');
  }
  return sketches.map(({name,fqbn})=>({
   name,fqbn,folder:path.join(root,name),
   sketch:path.join(root,name,name+'.ino')
  }));
 }catch(err){
  // Remove only directories created by this invocation.
  for(const dir of created.reverse())fs.rmSync(dir,{recursive:true,force:true});
  throw err;
 }
}

module.exports={outputRoot,exportSketches};
