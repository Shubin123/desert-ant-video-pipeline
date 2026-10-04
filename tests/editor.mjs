// Workflow editor e2e: the dropdown, the graph editor driven with a real mouse and keyboard, the stage-panel controls,
// save/revert/delete, persistence, untrusted storage, and runs that follow the workflow. Model runtimes are stubs
// (labelled test doubles) so runs are deterministic and need no downloads.
import {start,loadExample,audit,waitIdle,check,finish,out} from './lib/harness.mjs';
import {WORKFLOWS} from '../site/pipeline/workflow.js';

let hang=false;
const results=[],h=await start({viewport:{width:1280,height:1000}}),{page,base}=h;
await page.route('**/models/*/runtime.js',route=>{const id=route.request().url().match(/models\/(\w+)\/runtime\.js/)[1];route.fulfill({contentType:'text/javascript',body:
  `const rec=()=>{try{(parent.__calls??=[]).push(${JSON.stringify(id)});}catch{}};export async function load(){return {
    async transcribe(){rec();${hang?'return new Promise(()=>{});':''}const j=await(await fetch('examples/2b.json')).json();return {words:j.words};},
    async identify(){rec();return {language:'en'};},async analyze(){rec();return {fillers:[]};},
    async refine(s,r,words){rec();return words.map(w=>({start:w.start,end:w.end}));},async clips(){rec();return [{lo:0,hi:0,score:.9}];},
    async enhance(samples,rate){rec();return {samples,sampleRate:rate};}};}`});});

const G='#view-graph';
const edgeList=()=>page.evaluate(()=>[...document.querySelectorAll('#view-graph .link')].map(g=>`${g.dataset.from}>${g.dataset.to}`).sort());
const offStages=async()=>({graph:await page.evaluate(()=>[...document.querySelectorAll('#view-graph .node.off')].map(n=>n.dataset.stage)),grid:await page.evaluate(()=>[...document.querySelectorAll('.stage-card.off')].map(n=>n.dataset.stage))});
const state=()=>page.locator('#workflow-status').textContent(),message=()=>page.locator('#workflow-message').textContent();
const calls=()=>page.evaluate(()=>window.__calls??[]);
async function connectByMouse(from,to,{center=true}={}){
  // Real pointer input needs both ends on screen: centre the source stage first.
  if(center)await page.locator(`${G} .node[data-stage="${from}"]`).evaluate(n=>n.scrollIntoView({block:'center',inline:'center'}));
  const port=await page.locator(`${G} .node[data-stage="${from}"] .port`).boundingBox(),target=await page.locator(`${G} .node[data-stage="${to}"] rect`).boundingBox();
  await page.mouse.move(port.x+port.width/2,port.y+port.height/2);await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:10});await page.mouse.up();await page.waitForTimeout(50);
}
// Click the connection where a person would: on the line itself, halfway along (a curve's box centre can miss it).
async function clickEdge(from,to){
  const sel=`${G} .link[data-from="${from}"][data-to="${to}"] .edge-hit`;await page.locator(sel).evaluate(p=>p.scrollIntoView({block:'center',inline:'center'}));
  const {x,y}=await page.locator(sel).evaluate(p=>{const pt=p.getPointAtLength(p.getTotalLength()/2).matrixTransform(p.getScreenCTM());return {x:pt.x,y:pt.y};});
  await page.mouse.click(x,y);
}
async function openStage(id){await page.evaluate(id=>{location.hash=`#/graph/${id}`;},id);await page.waitForFunction(id=>!document.querySelector('#stage-detail').hidden&&document.querySelector('.node[aria-pressed="true"]')?.dataset.stage===id,id);}
const fullEdges=['align>clips','clear>review','clips>laya','clips>review','ear>align','laya>review','review>export','source>clear','source>ear','source>uhm','source>voz','uhm>review','voz>align'];

try{
  await page.goto(base+'#/graph');
  const options=await page.locator('#workflow option').evaluateAll(o=>o.map(x=>x.value));
  check(results,'dropdown lists every built-in workflow, Full pipeline selected',JSON.stringify(options)===JSON.stringify(WORKFLOWS.map(w=>w.id))&&await page.locator('#workflow').inputValue()==='full',options.join(','));
  check(results,'full workflow: every stage included, every edge drawn',(await offStages()).graph.length===0&&JSON.stringify(await edgeList())===JSON.stringify(fullEdges),(await edgeList()).join(' '));
  check(results,'full workflow: built in, no issues',(await state())==='Full pipeline · built in'&&(await page.locator('#workflow-issues li').allTextContents()).join()==='Every included stage has the inputs it needs.');

  // Choosing a workflow reshapes graph and grid.
  for(const w of WORKFLOWS){
    await page.locator('#workflow').selectOption(w.id);const off=await offStages(),want=Object.entries(w.stages).filter(([,s])=>!s.on).map(([id])=>id);
    check(results,`${w.id}: excluded stages dimmed in graph and grid`,JSON.stringify(off.graph)===JSON.stringify(want)&&JSON.stringify(off.grid.sort())===JSON.stringify([...want].sort()),JSON.stringify(off));
    check(results,`${w.id}: only edges between included stages`,(await edgeList()).every(e=>e.split('>').every(id=>!want.includes(id))));
    check(results,`${w.id}: description and state shown`,(await page.locator('#workflow-detail').textContent())===w.detail&&(await state())===`${w.label} · built in`);
  }
  await page.locator('#workflow').selectOption('quick-cut');
  check(results,'grid card of an excluded stage says so and lists only included predecessors',(await page.locator('.stage-card[data-stage="uhm"] .state').textContent())==='not in workflow'&&(await page.locator('.stage-card[data-stage="review"] .meta').textContent()).startsWith('after Clips, Laya'));
  await page.locator('#workflow').selectOption('imported-cut');
  check(results,'missing input is flagged before running',(await page.locator('#workflow-issues li[data-level="warn"]').allTextContents()).some(t=>t.startsWith('Clips needs a transcript')));

  // Runs follow the workflow.
  await loadExample(page);
  check(results,'loading a transcript turns the warning into a note',(await page.locator('#workflow-issues li[data-level="warn"]').count())===0&&(await page.locator('#workflow-issues li[data-level="info"]').allTextContents()).some(t=>t.startsWith('Clips will use the transcript already loaded')));
  check(results,'included stages take the top rows, excluded ones sit below',await page.evaluate(()=>{const y=id=>document.querySelector(`#view-graph .node[data-stage="${id}"]`).getBoundingClientRect().y;return y('clips')<y('voz')&&y('clips')<y('ear');}));await page.locator('#workflow').selectOption('transcript');await page.evaluate(()=>{window.__calls=[];});
  let before=(await audit(page)).split('\n').length;await page.locator('#analyze').click();await waitIdle(page,60000);
  let log=(await audit(page)).split('\n').slice(before);
  check(results,'Analyze under Transcript only runs Voz, Ear, Align',JSON.stringify(await calls())==='["voz","ear","align"]'&&log[0]==='workflow: active — Transcript only: Voz, Ear, Align',log[0]);
  await openStage('clips');
  check(results,'excluded stage cannot be run, and says why',await page.locator('#stage-detail [data-run="stage"]').isDisabled()&&(await page.locator('#stage-detail .run-plan').textContent())==='Not in this workflow. Include it to run it.');

  // Graph editing with the mouse.
  await page.locator('#workflow').selectOption('full');await page.evaluate(()=>{location.hash='#/graph';});
  await connectByMouse('uhm','align');
  check(results,'drag from Uhm port onto Align connects them',(await edgeList()).includes('uhm>align')&&(await message())==='Align now runs after Uhm',await message());
  check(results,'an edit marks the workflow edited',(await state())==='Full pipeline · edited, not saved'&&await page.locator('#workflow-revert').isEnabled());
  check(results,'layout follows the new edge: Align moves after Uhm',await page.evaluate(()=>{const x=id=>document.querySelector(`#view-graph .node[data-stage="${id}"]`).getBoundingClientRect().x;return x('align')>x('uhm');}));
  check(results,'dragging does not open a stage panel',await page.locator('#stage-detail').isHidden());
  const n=(await edgeList()).length;await connectByMouse('review','voz');
  check(results,'a loop is refused with a reason',(await edgeList()).length===n&&/loop/.test(await message()),await message());
  await connectByMouse('voz','align');
  check(results,'a duplicate connection is refused',(await edgeList()).length===n&&/already runs after/.test(await message()),await message());
  await connectByMouse('uhm','source');
  check(results,'nothing can run before Source',(await edgeList()).length===n&&/Source is always first/.test(await message()));
  // Selecting and deleting connections: click + Delete key, the × button, and keyboard focus.
  await clickEdge('uhm','align');
  check(results,'clicking a connection selects it',await page.locator(`${G} .link[data-from="uhm"][data-to="align"]`).evaluate(g=>g.classList.contains('selected')));
  await page.keyboard.press('Delete');
  check(results,'Delete removes the selected connection',!(await edgeList()).includes('uhm>align')&&(await message())==='Align no longer runs after Uhm');
  check(results,'removing the only change makes the workflow unedited again',(await state())==='Full pipeline · built in');
  await clickEdge('clear','review');await page.locator(`${G} .link[data-from="clear"][data-to="review"] .edge-del`).click();
  check(results,'the × on a selected connection removes it',!(await edgeList()).includes('clear>review'));
  await page.locator(`${G} .link[data-from="source"][data-to="uhm"] .edge-hit`).focus();await page.keyboard.press('Backspace');
  check(results,'keyboard: focus a connection and press Backspace',!(await edgeList()).includes('source>uhm'));
  await page.locator('#workflow-revert').click();
  check(results,'Revert restores the built-in workflow',JSON.stringify(await edgeList())===JSON.stringify(fullEdges)&&(await state())==='Full pipeline · built in');

  // Stage-panel controls.
  await openStage('align');await page.locator('#stage-included').uncheck();
  check(results,'excluding Align dims it and bridges Voz and Ear to Clips',(await offStages()).graph.join()==='align'&&(await edgeList()).includes('voz>clips')&&(await edgeList()).includes('ear>clips'),(await edgeList()).join(' '));
  check(results,'excluding keeps the workflow valid',(await page.locator('#workflow-issues li[data-level="warn"]').count())===0);
  await page.locator('#stage-included').check();
  check(results,'including Align again',(await offStages()).graph.length===0);
  await openStage('clips');await page.locator('#stage-detail .runs-after input[data-after="uhm"]').check();
  check(results,'"Runs after" checkbox adds a connection',(await edgeList()).includes('uhm>clips'));
  await page.locator('#stage-detail .runs-after input[data-after="uhm"]').uncheck();
  check(results,'"Runs after" checkbox removes it',!(await edgeList()).includes('uhm>clips'));
  await openStage('voz');const loop=page.locator('#stage-detail .runs-after input[data-after="align"]');
  check(results,'a choice that would loop is disabled, with the reason as its tooltip',await loop.isDisabled()&&/loop/.test(await loop.evaluate(i=>i.parentElement.title)));
  await openStage('source');
  check(results,'Source cannot be excluded or run after anything',await page.locator('#stage-included').isDisabled()&&await page.locator('#stage-detail .runs-after input:not(:disabled)').count()===0);
  await openStage('align');for(const d of ['voz','ear'])await page.locator(`#stage-detail .runs-after input[data-after="${d}"]`).uncheck();
  // A worked example is loaded, so Align falls back to that transcript: a note, not a warning.
  check(results,'cutting Align off from its transcript is flagged',(await page.locator('#workflow-issues li[data-level="info"]').allTextContents()).some(t=>t.startsWith('Align will use the transcript already loaded')));
  await page.locator('#workflow-revert').click();

  // Edited run: Align after Uhm changes the real execution order.
  await page.evaluate(()=>{location.hash='#/graph';});await connectByMouse('uhm','align');await page.evaluate(()=>{window.__calls=[];});
  before=(await audit(page)).split('\n').length;await page.locator('#analyze').click();await waitIdle(page,60000);log=(await audit(page)).split('\n').slice(before);
  check(results,'edited workflow is announced and followed',log[0].startsWith('workflow: active — Full pipeline (edited)')&&JSON.stringify((await calls()).slice(0,4))==='["voz","ear","uhm","align"]',JSON.stringify(await calls()));
  const project=await (async()=>{await page.locator('#project').click();return page.evaluate(async()=>(await fetch([...document.querySelectorAll('#downloads a')].at(-1).href)).json());})();
  check(results,'project JSON records the workflow it ran under',project.workflow?.stages?.align?.deps?.includes('uhm'));

  // Unsaved edits survive a reload; saving, renaming rules, persistence, delete.
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#view-graph .node').length===10);
  check(results,'unsaved edit survives a reload',(await edgeList()).includes('uhm>align')&&(await state())==='Full pipeline · edited, not saved');
  await page.locator('#workflow-name').fill('full pipeline');await page.locator('#workflow-save').click();
  check(results,'cannot save over a built-in name',/built-in workflow/.test(await message())&&(await state()).includes('edited'));
  await page.locator('#workflow-name').fill('Uhm first');await page.locator('#workflow-save').click();
  const saved=await page.locator('#workflow optgroup[label="Saved in this browser"] option').allTextContents();
  check(results,'Save stores it under its name and selects it',JSON.stringify(saved)==='["Uhm first"]'&&(await state())==='Uhm first · saved in this browser'&&await page.locator('#workflow-delete').isEnabled());
  await page.locator('#workflow').selectOption('transcript');await page.locator('#workflow').selectOption({label:'Uhm first'});
  check(results,'saved workflow can be chosen again',(await edgeList()).includes('uhm>align'));
  await connectByMouse('uhm','clips');await page.locator('#workflow-save').click();
  check(results,'Save on a saved workflow updates it',/Updated "Uhm first"/.test(await message())&&(await page.locator('#workflow optgroup[label="Saved in this browser"] option').count())===1);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#view-graph .node').length===10);
  check(results,'saved workflow and selection survive a reload',(await state())==='Uhm first · saved in this browser'&&(await edgeList()).includes('uhm>clips'));
  await connectByMouse('ear','uhm');await page.locator('#workflow').selectOption('full');
  check(results,'switching away discards unsaved edits and says so',(await message())==='Unsaved changes discarded.');
  await page.locator('#workflow').selectOption({label:'Uhm first'});check(results,'the saved version is unchanged',!(await edgeList()).includes('ear>uhm'));
  await page.locator('#workflow-delete').click();
  check(results,'Delete removes it and returns to Full pipeline',(await page.locator('#workflow optgroup[label="Saved in this browser"]').count())===0&&(await state())==='Full pipeline · built in');
  check(results,'built-in workflows cannot be deleted',await page.locator('#workflow-delete').isDisabled());

  // Editing is locked while a run is in progress.
  // The reloads above cleared the source, so load it again; Voz then starts and never answers.
  await loadExample(page);hang=true;await openStage('voz');await page.locator('#stage-detail [data-run="stage"]').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('voz: running'));
  const lockedEdges=await edgeList();await connectByMouse('uhm','align');
  const lockedMsg=await message();await page.locator('#workflow').selectOption('transcript');
  check(results,'no edits or workflow switches during a run',JSON.stringify(await edgeList())===JSON.stringify(lockedEdges)&&/Finish or cancel/.test(lockedMsg)&&await page.locator('#workflow').inputValue()==='full',lockedMsg);
  await page.locator('#cancel').click();await waitIdle(page,10000);hang=false;
  check(results,'controls come back after the run',await page.locator('#stage-included').isEnabled()&&await page.locator('#stage-detail .runs-after input:not(:disabled)').count()>0);

  // Stored workflows are untrusted.
  for(const [name,wfs,current] of [['garbage JSON','{not json','{nope'],['cyclic saved workflow',JSON.stringify([{id:'custom-x',label:'Loop',stages:{voz:{on:true,deps:['align']},align:{on:true,deps:['voz']}}}]),JSON.stringify({base:'custom-x'})],
    ['unknown base and bad draft','[]',JSON.stringify({base:'nope',draft:{stages:'x'}})],['saved workflow posing as a built-in',JSON.stringify([{id:'full',label:'Evil',stages:{}}]),'null']]){
    await page.evaluate(([a,b])=>{localStorage.setItem('pipeline.workflows',a);localStorage.setItem('pipeline.workflow',b);},[wfs,current]);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#view-graph .node').length===10);
    check(results,`stored ${name}: falls back to Full pipeline`,(await state())==='Full pipeline · built in'&&JSON.stringify(await edgeList())===JSON.stringify(fullEdges)&&!(await page.locator('#workflow option').allTextContents()).includes('Evil'));
  }
  await page.evaluate(()=>localStorage.clear());

  // Phone width: the graph turns vertical and its ports still connect.
  await page.setViewportSize({width:390,height:844});await page.reload();await page.evaluate(()=>{location.hash='#/graph';});await page.waitForTimeout(200);
  // The vertical graph is wider than a phone; bring Ear to the left edge so Ear and Uhm are both on screen.
  await page.locator(`${G} .node[data-stage="ear"]`).evaluate(n=>n.scrollIntoView({block:'center',inline:'start'}));await connectByMouse('uhm','ear',{center:false});
  check(results,'phone: connect by dragging in the vertical graph',(await edgeList()).includes('uhm>ear'),await message());
  // Align is scrolled out of the graph's view; holding the drag at the graph's edge scrolls it into reach.
  await page.locator(`${G} .node[data-stage="clear"]`).evaluate(n=>n.scrollIntoView({block:'center',inline:'center'}));
  const port=await page.locator(`${G} .node[data-stage="clear"] .port`).boundingBox(),box=await page.locator(G).boundingBox();
  await page.mouse.move(port.x+6,port.y+6);await page.mouse.down();await page.mouse.move(box.x+8,port.y+60,{steps:5});
  for(let k=0;k<40;k++)await page.mouse.move(box.x+8+(k%2),port.y+60);
  const align=await page.locator(`${G} .node[data-stage="align"] rect`).boundingBox();
  const reachable=align.x>=box.x&&align.x+align.width<=box.x+box.width;
  await page.mouse.move(align.x+align.width/2,align.y+align.height/2,{steps:5});await page.mouse.up();
  check(results,'phone: dragging at the graph edge scrolls hidden stages into reach',reachable&&(await edgeList()).includes('clear>align'),await message());
  check(results,'phone: no horizontal page scroll',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/editor-phone.png`,fullPage:true});
  check(results,'no page errors',h.errors.length===0,h.errors.join('; '));
}catch(e){check(results,'editor run',false,e.stack);}
finally{await h.close();}
finish(results,'editor');
