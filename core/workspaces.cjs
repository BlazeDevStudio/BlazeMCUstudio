'use strict';
// Workspace is a directory-like relationship between independently buildable firmware targets.
// It never copies, combines, or alters a project's board core, source, or build settings.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {analyzeLink}=require('./link-advisor.cjs');
const {referencePins}=require('./link-pin-reference.cjs');
const {parseShape,checkPins}=require('./link-signal-plan.cjs');
const LINK_KINDS=new Set(['uart','i2c','spi','wifi','esp-now','custom']);
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checkName(name){
 if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[\x00-\x1F]/.test(name))throw Error('Workspace name must be 1–80 printable characters');
 return name.trim();
}
class WorkspaceCatalog {
 constructor(projectStore){
  if(!projectStore?.root||typeof projectStore.open!=='function')throw Error('Project store required');
  this.projects=projectStore;
  this.filename=path.join(projectStore.root,'_workspaces.json');
 }
 read(){
  if(!fs.existsSync(this.filename))return {version:1,items:[]};
  const data=JSON.parse(fs.readFileSync(this.filename,'utf8'));
  if(data?.version!==1||!Array.isArray(data.items)||data.items.length>100)throw Error('Invalid workspace catalog: recovery required');
  const ids=new Set();
  for(const x of data.items){
   if(!ID.test(x?.id||'')||ids.has(x.id)||checkName(x.name)!==x.name||!Array.isArray(x.projectIds)||x.projectIds.length>100||new Set(x.projectIds).size!==x.projectIds.length||x.projectIds.some(id=>!ID.test(id)))throw Error('Invalid workspace catalog entry');
   const links=x.links===undefined?[]:x.links;
   if(!Array.isArray(links)||links.length>100)throw Error('Invalid workspace links');
   const linkIds=new Set(),unique=new Set();
   for(const link of links){
    if(!link||typeof link!=='object'||Array.isArray(link)
     ||typeof link.id!=='string'||!ID.test(link.id)||linkIds.has(link.id)
     ||typeof link.from!=='string'||!x.projectIds.includes(link.from)
     ||typeof link.to!=='string'||!x.projectIds.includes(link.to)
     ||link.from===link.to||!LINK_KINDS.has(link.kind)
     ||typeof link.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(link.createdAt))
      throw Error('Invalid workspace link');
    if(link.pins!==undefined)parseShape(link.kind,link.pins);
    const key=link.kind+'|'+link.from+'|'+link.to;
    if(unique.has(key))throw Error('Duplicate workspace link');
    linkIds.add(link.id);unique.add(key);
   }
   ids.add(x.id);
  }
  return data;
 }
 write(data){
  const tmp=this.filename+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try{
   fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});
   fs.renameSync(tmp,this.filename);
  }finally{if(fs.existsSync(tmp))fs.rmSync(tmp);}
 }
 list(){return this.read().items.map(x=>{
  const missingIds=x.projectIds.filter(id=>{try{this.projects.open(id);return false;}catch{return true;}});
  const missing=new Set(missingIds);
  return {...x,projectIds:[...x.projectIds],missingIds,links:(x.links||[]).map(l=>({...l,available:!missing.has(l.from)&&!missing.has(l.to)}))};
 });}
 get(id){if(!ID.test(String(id)))throw Error('Invalid workspace ID');const workspace=this.list().find(x=>x.id===id);if(!workspace)throw Error('Workspace not found');return workspace;}
 create(name){const entry={id:randomUUID(),name:checkName(name),projectIds:[],links:[],createdAt:new Date().toISOString()};const data=this.read();if(data.items.length>=100)throw Error('Workspace limit reached');data.items.push(entry);this.write(data);return structuredClone(entry);}
 rename(id,name){return this.edit(id,x=>{x.name=checkName(name);});}
 add(id,projectId){if(!ID.test(String(projectId)))throw Error('Invalid project ID');this.projects.open(projectId);return this.edit(id,x=>{if(!x.projectIds.includes(projectId)){if(x.projectIds.length>=100)throw Error('Workspace project limit reached');x.projectIds.push(projectId);}});}
 remove(id,projectId){if(!ID.test(String(projectId)))throw Error('Invalid project ID');return this.edit(id,x=>{
  x.projectIds=x.projectIds.filter(p=>p!==projectId);
  // Unlinking membership must not leave topology edges referencing nonmembers.
  x.links=(x.links||[]).filter(l=>l.from!==projectId&&l.to!==projectId);
 });}
 link(id,from,to,kind){
  if(!ID.test(String(from))||!ID.test(String(to))||from===to||!LINK_KINDS.has(kind))throw Error('Invalid planned device link');
  this.projects.open(from);this.projects.open(to);
  return this.edit(id,x=>{
   if(!x.projectIds.includes(from)||!x.projectIds.includes(to))throw Error('Both devices must be in this workspace');
   const links=x.links||[];
   if(links.some(l=>l.from===from&&l.to===to&&l.kind===kind))throw Error('Planned device link already exists');
   if(links.length>=100)throw Error('Workspace link limit reached');
   links.push({id:randomUUID(),from,to,kind,createdAt:new Date().toISOString()});
   x.links=links;
  });
 }
 assess(id,linkId){
  if(!ID.test(String(linkId)))throw Error('Invalid planned link ID');
  const w=this.get(id),link=w.links.find(x=>x.id===linkId);
  if(!link)throw Error('Planned link not found');
  let source,target;
  try{source=this.projects.open(link.from);target=this.projects.open(link.to);}
  catch{return {status:'blocked',safeToWire:false,firmwareGenerated:false,kind:link.kind,
   linkId:link.id,errors:['A project endpoint is unavailable, deleted or corrupt; recover or repair it before reassessment'],
   warnings:[],provenance:[]};}
  return {...analyzeLink(source,target,link.kind),linkId:link.id};
 }
 assignPins(id,linkId,input){
  if(!ID.test(String(linkId)))throw Error('Invalid planned link ID');
  return this.edit(id,w=>{
   const link=(w.links||[]).find(l=>l.id===linkId);
   if(!link)throw Error('Planned link not found');
   const from=this.projects.open(link.from),to=this.projects.open(link.to);
   const others=(w.links||[]).filter(l=>l.id!==linkId&&l.pins);
   const claimed=projectId=>others.flatMap(l=>{
    const source=l.from===projectId?Object.values(l.pins.source):[];
    const target=l.to===projectId?Object.values(l.pins.target):[];
    return [...source,...target];
   });
   const checked=checkPins(from,to,link.kind,input,{
    source:claimed(link.from),target:claimed(link.to)
   });
   if(checked.errors.length)throw Error('Signal plan rejected: '+checked.errors.join('; '));
   link.pins=checked.pins; // independent metadata; no firmware project write.
  });
 }
 clearPins(id,linkId){
  if(!ID.test(String(linkId)))throw Error('Invalid planned link ID');
  return this.edit(id,w=>{
   const link=(w.links||[]).find(l=>l.id===linkId);
   if(!link)throw Error('Planned link not found');
   delete link.pins;
  });
 }
 pinReference(id,linkId,orientation='source-controller'){
  if(!ID.test(String(linkId)))throw Error('Invalid planned link ID');
  const w=this.get(id),link=w.links.find(x=>x.id===linkId);
  if(!link)throw Error('Planned link not found');
  let from,to;
  try{from=this.projects.open(link.from);to=this.projects.open(link.to);}
  catch{return {status:'blocked',safeToWire:false,firmwareGenerated:false,source:null,target:null,
    linkId,kind:link.kind,orientation,errors:['A project endpoint is unavailable or corrupt'],
    warnings:['No physical pin reference can be provided for missing firmware targets']};}
  return {...referencePins(from,to,link.kind,orientation),linkId};
 }
 unlink(id,linkId){
  if(!ID.test(String(linkId)))throw Error('Invalid link ID');
  return this.edit(id,x=>{
   if(!(x.links||[]).some(l=>l.id===linkId))throw Error('Planned link not found');
   x.links=x.links.filter(l=>l.id!==linkId);
  });
 }
 delete(id){if(!ID.test(String(id)))throw Error('Invalid workspace ID');const data=this.read();const n=data.items.findIndex(x=>x.id===id);if(n<0)throw Error('Workspace not found');const [old]=data.items.splice(n,1);this.write(data);return {id:old.id,removedAssociationCount:old.projectIds.length,projectsDeleted:0};}
 edit(id,change){if(!ID.test(String(id)))throw Error('Invalid workspace ID');const data=this.read();const x=data.items.find(w=>w.id===id);if(!x)throw Error('Workspace not found');change(x);this.write(data);return {...x,projectIds:[...x.projectIds],links:(x.links||[]).map(l=>({...l}))};}
}
module.exports={WorkspaceCatalog,checkName};
