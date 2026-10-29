'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'../renderer');
test('all static UI selectors reference existing unique elements',()=>{const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');const refs=[...app.matchAll(/\$\('(#[A-Za-z\d_-]+)'\)/g)].map(m=>m[1].slice(1));const all=[...html.matchAll(/\bid="([A-Za-z\d_-]+)"/g)].map(m=>m[1]),ids=new Set(all);assert.equal(ids.size,all.length);for(const id of refs)assert(ids.has(id),'Missing UI element '+id);});
test('flowchart and library editor tabs have dedicated views',()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const token of ['data-tab="flowchart"','id="flowchartView"','data-tab="libraries"','id="librariesView"','id="manualMode"'])assert(html.includes(token));});
test('typed state UI has a complete input and inspector surface',()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');for(const id of ['variablesView','varName','varType','varInitial','varAdd','variableList','simAnalogPin','simAnalogValue','simSetAnalog','simVariables','newTemplate'])assert(html.includes(`id="${id}"`),id);for(const kind of ['setVariable','readAnalog','thresholdOutput'])assert(html.includes(`data-add="${kind}"`),kind);assert(app.includes('renderVariables()'));assert(app.includes('window.blaze.simAnalog'));});

test('workspace collection and multi-project tab controls are actually addressable',()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');for(const id of ['workspaceSelect','workspaceCreate','workspaceRename','workspaceDelete','workspaceAddCurrent','workspaceRemoveCurrent','workspaceSummary','openProjectTabs'])assert(html.includes(`id="${id}"`),id);for(const api of ['window.blaze.createWorkspace','window.blaze.addToWorkspace','window.blaze.removeFromWorkspace','window.blaze.deleteWorkspace'])assert(app.includes(api),api);});

test('desktop tab persistence is wired through secure IPC, restore path and UI handlers',()=>{
 const electron=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 for(const id of ["'session:load'","'session:save'"])assert(electron.includes(id),id);
 for(const name of ["getSession:'session:load'","saveSession:'session:save'"])assert(preload.includes(name),name);
 assert(app.includes('async function restoreSession()'));
 assert(app.includes('await restoreSession();'));
 assert(app.includes('await persistSession();'));
 assert(electron.includes('sessionRestoreUI:true'));
});

test('workspace link planner is exposed in GUI, preload, IPC and packaged smoke',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
 for(const id of ['workspaceLinksPanel','linkSource','linkTarget','linkKind','linkCreate','linkList'])
  assert(html.includes('id="'+id+'"'),id);
 for(const api of ['window.blaze.planWorkspaceLink','window.blaze.removeWorkspaceLink'])
  assert(app.includes(api),api);
 for(const channel of ["'workspace:link'","'workspace:unlink'"])
  assert(preload.includes(channel)&&main.includes(channel),channel);
 assert(main.includes('workspaceLinkUI:true'));
});

test('workspace board advisor uses saved link identity through scoped read-only IPC and a visible per-link action',()=>{
 const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const electron=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 assert(source.includes('window.blaze.assessWorkspaceLink(workspaceId,linkId)'));
 assert(source.includes('data-assess-workspace-link'));
 assert(electron.includes("'workspace:assess'"));
 assert(preload.includes("assessWorkspaceLink:'workspace:assess'"));
 assert(electron.includes('workspaceLinkAdvisorUI:true'));
});

test('saved board-pin references run through explicit IPC and can render in packaged GUI',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 assert(app.includes('data-pin-reference'));
 assert(app.includes('data-pin-orientation'));
 assert(app.includes('window.blaze.referenceWorkspacePins(workspaceId,linkId,orientation)'));
 assert(main.includes("'workspace:pinReference'"));
 assert(preload.includes("referenceWorkspacePins:'workspace:pinReference'"));
 assert(main.includes('workspaceLinkPinUI:true'));
});
