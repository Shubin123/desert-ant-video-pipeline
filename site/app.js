import {layaChoice,validateTimeline,planFromSentences} from './failover.js';
import {exportVideo} from './export.js';
import {NODES,selection} from './pipeline/graph.js';
import {runPipeline} from './pipeline/engine.js';
import {steps} from './pipeline/steps.js';
import {DEMOS,demo} from './pipeline/demos.js';
import {WORKFLOWS,workflow as builtin,active,nodes as workflowNodes,included,connect,disconnect,setIncluded,canConnect,issues,same,parse,serialize} from './pipeline/workflow.js';
import {validateWords,repairAlignment} from './pipeline/words.js';
import {createStatus} from './ui/status.js';
import {mountGrid} from './ui/grid.js';
import {mountGraph} from './ui/graph.js';
import {startRouter} from './ui/router.js';
import {sortable} from './ui/sortable.js';
const $=id=>document.getElementById(id);
// Shared pipeline state; steps read and write it through the context below.
const S={file:null,audio:null,words:[],sentences:[],results:{},preferred:[],clipsFailed:false,speech:null};
let audit=[],abort,previewURL,recorder,recordingStream,busy=false,selected=null;
// The workflow every run follows: wf is what is shown and run, base the built-in or saved workflow it came from.
let saved=[],base=WORKFLOWS[0],wf=base;
const voices=new Map(),urls=[],status=createStatus();
const models=['align','clear','clips','ear','emo','gist','moderator','redact','shapes','title','tongue','uhm','voz','eye','face','schemer','toxic','who'];
for(const id of models){const a=document.createElement('a');a.href=`https://shubin123.github.io/desert-ant-${id}-demo/`;a.textContent=`${id[0].toUpperCase()+id.slice(1)} ↗`;a.target='_blank';a.rel='noopener';$('models').append(a);}
function log(stage,state,detail){const entry={time:new Date().toISOString(),stage,status:state,detail};audit.push(entry);status.push(entry);$('status').textContent=audit.map(x=>`${x.stage}: ${x.status} — ${x.detail}`).join('\n');$('status').scrollTop=$('status').scrollHeight;}
function showResults(){$('results').textContent=JSON.stringify({transcript:S.words.map(w=>w.text).join(' '),...S.results},null,2);}
async function decode(blob,rate=48000){const context=new AudioContext({sampleRate:rate});try{const raw=await context.decodeAudioData(await blob.arrayBuffer()),offline=new OfflineAudioContext(1,Math.ceil(raw.duration*rate),rate),source=offline.createBufferSource();source.buffer=raw;source.connect(offline.destination);source.start();return await offline.startRendering();}finally{await context.close();}}
function makeSentences(){S.sentences=[];let group=[];for(const w of S.words){group.push(w);if(/[.!?]$/.test(w.text)||group.length>=25){S.sentences.push({text:group.map(x=>x.text).join(' '),start:group[0].start,end:w.end});group=[];}}if(group.length)S.sentences.push({text:group.map(x=>x.text).join(' '),start:group[0].start,end:group.at(-1).end});}
function setWords(value){S.words=validateWords(value,S.audio.duration);makeSentences();renderIssues();}
async function source(blob){if(busy)throw Error('Cancel the current operation before changing sources.');S.file=blob;S.audio=await decode(blob);Object.assign(S,{words:[],sentences:[],results:{},preferred:[],clipsFailed:false,speech:null});audit=[];status.reset();voices.clear();$('timeline').value='';$('slots').replaceChildren();$('slot').replaceChildren();$('downloads').replaceChildren();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);$('preview').src=previewURL;$('source-status').textContent=`${blob.name||'Video'} · ${S.audio.duration.toFixed(2)} seconds · original untouched`;showResults();renderIssues();}
function stage(id,payload){return new Promise((resolve,reject)=>{const nonce=crypto.randomUUID(),frame=document.createElement('iframe');frame.hidden=true;let settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);removeEventListener('message',receive);abort.signal.removeEventListener('abort',cancel);frame.remove();error?reject(error):resolve(result);};const cancel=()=>finish(new DOMException('Cancelled','AbortError'));const timer=setTimeout(()=>finish(Error(`${id} exceeded its ten-minute limit`)),600000);function receive(e){if(e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.nonce!==nonce)return;if(e.data.ready)frame.contentWindow.postMessage({nonce,payload},location.origin);else if(e.data.error)finish(Error(e.data.error));else if(Object.hasOwn(e.data,'result'))finish(null,e.data.result);else if(Number.isFinite(e.data.progress))$('progress').value=e.data.progress;}addEventListener('message',receive);abort.signal.addEventListener('abort',cancel,{once:true});frame.src=`runner.html?model=${id}&nonce=${nonce}`;document.body.append(frame);});}
function validResult(id,value){
  const {audio,sentences}=S;
  if(id==='voz')validateWords(value?.words,audio.duration);
  if(id==='align')repairAlignment(S.words,value,audio.duration);
  if(id==='clear'&&(!value?.samples?.length||value.sampleRate!==48000||Math.abs(value.samples.length-audio.length)>4800||value.samples.some(x=>!Number.isFinite(x))))throw Error('Invalid enhanced audio output');
  if(id==='uhm'&&(!Array.isArray(value?.fillers)||value.fillers.some(x=>!Number.isFinite(x.start)||!Number.isFinite(x.end)||x.start<0||x.end<x.start||x.end>audio.duration+.1)))throw Error('Invalid filler spans');
  if(id==='clips'&&(!Array.isArray(value)||!value.length||value.some(x=>!Number.isInteger(x.lo)||!Number.isInteger(x.hi)||x.lo<0||x.hi<x.lo||x.hi>=sentences.length||!Number.isFinite(x.score))))throw Error('Invalid highlight scores');
  if(id==='ear'&&(!value||typeof value!=='object'))throw Error('Invalid language result');
  return value;
}
async function attempt(id,payload,fallback){const fault=demo($('demo').value).faults?.[id];log(id,'running',fault?'Injected test fault, not model inference':'Loading original Desert Ant Labs model');try{const value=validResult(id,await(fault?fault(payload,abort.signal):stage(id,payload)));log(id,'passed',fault?'Injected test output accepted by validation; not model inference':'Real model inference completed');return value;}catch(error){if(error.name==='AbortError')throw error;log(id,'failed',error.message);return await fallback(error);}}
async function decision(){if(!S.sentences.length)throw Error('A timestamped transcript is required; Laya cannot transcribe audio.');const options=Object.fromEntries(S.sentences.slice(0,40).map((s,i)=>[`excerpt_${i}`,s.text]));const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(120000)]);const value=await layaChoice(`Select a useful excerpt for a ${$('length').value}-second educational video.`,options,{enabled:$('laya').checked,endpoint:$('endpoint').value.trim(),signal});log('Laya',value.needsReview?'needs review':'fallback passed',`${value.choice}; confidence ${value.confidence}`);return {value,index:Number(value.choice.split('_')[1])};}
function setPlan(plan){$('timeline').value=JSON.stringify(plan,null,2);renderSlots(plan);renderIssues();}
function renderSlots(plan){voices.clear();$('slots').replaceChildren();$('slot').replaceChildren();let frame=0;for(let i=0;i<plan.segments.length;i++){const s=plan.segments[i];if('hold'in s){const div=document.createElement('div');div.className='slot';div.textContent=`Voice-over slot ${i+1}: ${(frame/30).toFixed(2)}–${((frame+s.frames)/30).toFixed(2)} s · ${s.voiceover||'Add your explanation'}`;$('slots').append(div);const option=document.createElement('option');option.value=i;option.textContent=`Slot ${i+1} · ${(s.frames/30).toFixed(2)} seconds`;$('slot').append(option);}frame+=s.frames;}}
async function operation(fn){if(busy)return;busy=true;abort=new AbortController();for(const b of document.querySelectorAll('button:not(.stage-card)'))if(!['cancel','stop-record'].includes(b.id))b.disabled=true;try{await fn();}catch(error){if(error.name==='AbortError')for(const n of NODES)if(status.get(n.id).tone==='running')log(n.id,'cancelled','Stopped before it finished');log('pipeline',error.name==='AbortError'?'cancelled':'needs attention',error.message);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;useWorkflow(wf,{draft:true});}}

// Pipeline map: grid and graph views share one status store and one selected stage.
const grid=mountGrid($('view-grid'),status,{onSelect:id=>router.go(currentView(),id)});
const graph=mountGraph($('view-graph'),status,{onSelect:id=>router.go(currentView(),id),
  onConnect:(from,to)=>editWorkflow(w=>connect(w,from,to),`${label(to)} now runs after ${label(from)}`),
  onDisconnect:(from,to)=>editWorkflow(w=>disconnect(w,from,to),`${label(to)} no longer runs after ${label(from)}`)});
const currentView=()=>$('view-graph').hidden?'grid':'graph';
function showStage(id){
  selected=NODES.some(n=>n.id===id)?id:null;grid.select(selected);graph.select(selected);
  const box=$('stage-detail');box.hidden=!selected;if(!selected)return;
  const n=NODES.find(x=>x.id===selected),s=status.get(selected);
  box.querySelector('h3').textContent=`${n.label} · ${n.kind}`;
  box.querySelector('.role').textContent=n.role+(n.fallback?` Fallback: ${n.fallback}.`:'');
  const inc=included(wf,selected);
  for(const b of box.querySelectorAll('[data-run]'))b.disabled=busy||!steps[selected]||!inc;
  box.querySelector('.run-plan').textContent=!steps[selected]?'Choose a video or load a worked example in panel 1; the source has no model to run.':!inc?'Not in this workflow. Include it to run it.':`Run up to here: ${runList(selected,'upstream')}. Run from here: ${runList(selected,'downstream')}.`;
  stageEditor(selected);
  box.querySelector('pre').textContent=s.history.length?s.history.map(x=>`${x.time.slice(11,19)}  ${x.status} — ${x.detail}`).join('\n'):'No events yet for this stage.';
}
status.subscribe(()=>{grid.update();graph.update();if(selected)showStage(selected);});
$('stage-detail').querySelector('.close').onclick=()=>router.go(currentView());
const label=id=>NODES.find(n=>n.id===id).label;
const runList=(id,mode)=>{const list=active(wf),pick=selection(id,mode,list);return list.filter(n=>steps[n.id]&&pick.has(n.id)).map(n=>n.label).join(' → ');};
function runStages(id,mode){return operation(async()=>{
  if(!included(wf,id))throw Error(`${label(id)} is not in this workflow. Include it to run it.`);
  log('run','started',`${label(id)} · ${{stage:'this stage only',upstream:'up to here',downstream:'from here'}[mode]}: ${runList(id,mode)}`);announceDemo();announceWorkflow();
  await runPipeline(steps,context(),{nodes:active(wf),only:selection(id,mode,active(wf)),target:id,onSkip:skipped});
});}
const skipped=id=>status.push({time:new Date().toISOString(),stage:id,status:'not needed',detail:'Only used when Clips fails'});
for(const b of $('stage-detail').querySelectorAll('[data-run]'))b.onclick=()=>selected&&runStages(selected,b.dataset.run);
const announce=text=>{$('sort-status').textContent=text;};
const layouts=[sortable($('view-grid'),{key:'pipeline.grid-order',label:el=>label(el.dataset.sortId),announce}),sortable(document.querySelector('.panels'),{key:'pipeline.panel-order',handle:'h2',label:el=>el.querySelector('h2').textContent.replace('⠿','').trim(),announce})];
$('reset-layout').onclick=()=>{for(const l of layouts)l.reset();};
const router=startRouter({grid:$('view-grid'),graph:$('view-graph')},{fallback:'grid',onStage:showStage});
// Workflow: the editable stage graph every run follows. Built-ins are fixed; an edit makes an unsaved draft of the selected
// workflow (kept across reloads) and "Save workflow" stores it by name in this browser. Stored values are untrusted.
const store={read(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},write(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}}};
for(const x of Array.isArray(store.read('pipeline.workflows'))?store.read('pipeline.workflows'):[]){try{const w=parse(x);if(!builtin(w.id)&&!saved.some(o=>o.id===w.id))saved.push(w);}catch{}}
const findWorkflow=id=>builtin(id)??saved.find(w=>w.id===id);
function workflowOptions(){
  const groups=[['Built in',WORKFLOWS],['Saved in this browser',saved]].filter(([,list])=>list.length).map(([name,list])=>{const g=document.createElement('optgroup');g.label=name;for(const w of list)g.append(new Option(w.label,w.id));return g;});
  $('workflow').replaceChildren(...groups);$('workflow').value=base.id;
}
function useWorkflow(next,{draft=false}={}){
  if(!draft)base=next;wf=draft?{...next,id:base.id,label:base.label,detail:base.detail,builtin:base.builtin}:next;
  store.write('pipeline.workflow',{base:base.id,draft:same(wf,base)?null:serialize(wf)});
  $('workflow').value=base.id;const all=workflowNodes(wf),on=active(wf).map(n=>n.id);grid.setWorkflow(all,on);graph.setWorkflow(all,on);
  const edited=!same(wf,base);
  $('workflow-detail').textContent=base.detail||'Saved in this browser.';
  $('workflow-status').textContent=`${base.label} · ${edited?'edited, not saved':base.builtin?'built in':'saved in this browser'}`;
  $('workflow-revert').disabled=busy||!edited;$('workflow-delete').disabled=busy||base.builtin;$('workflow-name').placeholder=base.builtin?'Name to save as':base.label;
  renderIssues();
  if(selected)showStage(selected);
}
// Workflow checks account for what is loaded: a worked example or imported transcript supplies the words.
function renderIssues(){
  const found=issues(wf,{have:[S.words.length&&'words',$('timeline').value.trim()&&'timeline'].filter(Boolean)});
  $('workflow-issues').replaceChildren(...(found.length?found:[{level:'ok',message:'Every included stage has the inputs it needs.'}]).map(i=>{const li=document.createElement('li');li.textContent=i.message;li.dataset.level=i.level;if(i.stage)li.dataset.stage=i.stage;return li;}));
}
function editWorkflow(change,message){
  if(busy){$('workflow-message').textContent='Finish or cancel the current run before editing the workflow.';return;}
  try{useWorkflow(change(wf),{draft:true});$('workflow-message').textContent=message;}catch(e){$('workflow-message').textContent=e.message;}
}
// Stage panel: include the stage, and choose what it runs after. Same rules as dragging in the graph.
function stageEditor(id){
  const box=$('stage-detail').querySelector('.wf-edit'),inc=$('stage-included'),after=box.querySelector('.runs-after');
  inc.checked=included(wf,id);inc.disabled=busy||id==='source';inc.onchange=()=>editWorkflow(w=>setIncluded(w,id,inc.checked),`${label(id)} ${inc.checked?'included':'excluded; what ran after it now runs after what it ran after'}`);
  after.replaceChildren(...NODES.filter(n=>n.id!==id).map(n=>{
    const on=wf.stages[id].deps.includes(n.id),why=on?null:canConnect(wf,n.id,id),box=document.createElement('input'),row=document.createElement('label');
    box.type='checkbox';box.checked=on;box.disabled=busy||id==='source'||!!why;box.dataset.after=n.id;row.title=id==='source'?'Source is always first':why??'';
    box.onchange=()=>editWorkflow(w=>box.checked?connect(w,n.id,id):disconnect(w,n.id,id),box.checked?`${label(id)} now runs after ${n.label}`:`${label(id)} no longer runs after ${n.label}`);
    row.classList.toggle('excluded',!included(wf,n.id));row.append(box,` ${n.label}${included(wf,n.id)?'':' (excluded)'}`);return row;}));
}
function announceWorkflow(){if(!(base.id==='full'&&same(wf,base)))log('workflow','active',`${wf.label}${same(wf,base)?'':' (edited)'}: ${active(wf).filter(n=>steps[n.id]).map(n=>n.label).join(', ')}`);}
$('workflow').onchange=()=>{const next=findWorkflow($('workflow').value);if(busy||!next){$('workflow').value=base.id;$('workflow-message').textContent='Finish or cancel the current run before switching workflows.';return;}
  const dropped=!same(wf,base);useWorkflow(next);$('workflow-message').textContent=dropped?'Unsaved changes discarded.':'';};
$('workflow-revert').onclick=()=>{useWorkflow(base);$('workflow-message').textContent=`Back to the saved ${base.label}.`;};
$('workflow-save').onclick=()=>{
  const name=$('workflow-name').value.trim()||(base.builtin?`${base.label} (custom)`:base.label);
  if(WORKFLOWS.some(w=>w.label.toLowerCase()===name.toLowerCase())){$('workflow-message').textContent=`"${name}" is a built-in workflow; choose another name.`;return;}
  const existing=saved.find(w=>w.label.toLowerCase()===name.toLowerCase()),next={...serialize(wf),id:existing?.id??`custom-${Date.now().toString(36)}`,label:name,detail:existing?.detail??`Saved in this browser from ${base.label}.`};
  const w=parse(next);saved=[...saved.filter(x=>x.id!==w.id),w];store.write('pipeline.workflows',saved.map(serialize));workflowOptions();useWorkflow(w);
  $('workflow-name').value='';$('workflow-message').textContent=`${existing?'Updated':'Saved'} "${name}" in this browser.`;
};
$('workflow-delete').onclick=()=>{if(base.builtin)return;const gone=base.label;saved=saved.filter(w=>w.id!==base.id);store.write('pipeline.workflows',saved.map(serialize));workflowOptions();useWorkflow(WORKFLOWS[0]);$('workflow-message').textContent=`Deleted "${gone}".`;};
{const last=store.read('pipeline.workflow'),start=findWorkflow(last?.base)??WORKFLOWS[0];workflowOptions();useWorkflow(start);
 if(last?.draft){try{useWorkflow(parse(last.draft),{draft:true});}catch{}}}

function context(){return {S,signal:abort.signal,log,attempt,decision,setWords,setPlan,showResults,exportVideo:exportTimeline,hasTimeline:()=>!!$('timeline').value.trim(),force:()=>!!demo($('demo').value).force,length:()=>Number($('length').value),
  speech:async()=>S.speech??={samples:(await decode(S.file,16000)).getChannelData(0).slice(),sampleRate:16000}};}

$('file').onchange=()=>{pickDemo('none');operationSource($('file').files[0]);};
async function operationSource(f){try{if(f){await source(f);log('input','loaded',`${f.name} · ${S.audio.duration.toFixed(2)} seconds`);}}catch(e){log('input','failed',e.message);}}
async function loadExample(id){const meta=await(await fetch(`examples/${id}.json`)).json();const response=await fetch(`examples/${id}-source.mp4`);if(!response.ok)throw Error('Sample download failed');await source(new File([await response.blob()],`${id}.mp4`,{type:'video/mp4'}));$('length').value=meta.plan.seconds;return meta;}
for(const button of document.querySelectorAll('[data-example]'))button.onclick=async()=>{try{pickDemo('none');const meta=await loadExample(button.dataset.example);setWords(meta.words);setPlan(meta.plan);log('worked example','loaded','Curated edit plus MLX Whisper tiny transcript. This is not a saved Desert Ant inference result. Run the models to replace it.');showResults();}catch(e){log('example','failed',e.message);}};
$('transcript').onchange=async()=>{try{if(!S.audio)throw Error('Load a source video first.');const j=JSON.parse(await $('transcript').files[0].text());setWords(j.words||j.segments?.flatMap(x=>x.words)||j);log('transcript','imported','User-supplied timestamps; not Voz inference');showResults();}catch(e){log('transcript','failed',e.message);}};
$('analyze').onclick=()=>operation(async()=>{
  if(!S.file)throw Error('Choose a video first.');
  S.speech=null;announceDemo();announceWorkflow();
  // Analyze runs the workflow up to its timeline; a workflow without one runs every included stage except export.
  const list=active(wf),only=list.some(n=>n.id==='review')?selection('review','upstream',list):new Set(list.filter(n=>n.id!=='export').map(n=>n.id));
  if(![...only].some(id=>steps[id]))throw Error(`${wf.label} has no stages to run. Include one in the graph.`);
  await runPipeline(steps,context(),{nodes:list,only,onSkip:skipped});
});
$('fallback').onclick=()=>operation(async()=>{const d=await decision();S.results.laya=d.value;setPlan(planFromSentences(S.sentences,Number($('length').value),[d.index]));showResults();});
$('cancel').onclick=()=>abort?.abort();
// Demo projects: choosing one restores its recorded run (source, transcript, results, timeline, audit, and so every
// stage's status in the grid and graph) and opens the view it is about. Its conditions stay active for live re-runs.
for(const d of DEMOS)$('demo').append(new Option(d.label,d.id));
function pickDemo(id){$('demo').value=demo(id).id;$('demo-detail').textContent=demo(id).detail;}
$('demo').onchange=()=>loadDemo($('demo').value);pickDemo('none');
async function loadDemo(id){
  const d=demo(id);pickDemo(d.id);if(!d.example)return;
  try{
    if(busy)throw Error('Cancel the current operation before loading a demo.');
    const response=await fetch(`demos/${d.id}.json`);if(!response.ok)throw Error(`Demo recording demos/${d.id}.json is missing`);
    const saved=await response.json();await loadExample(d.example);useWorkflow(findWorkflow(d.workflow??'full'));
    $('length').value=saved.plan.seconds;setWords(saved.words);S.results=saved.results??{};setPlan(saved.plan);
    for(const entry of saved.audit){audit.push(entry);status.push(entry);}
    log('demo','loaded',`${d.label}. Recorded ${saved.date.slice(0,10)} and replayed, not re-run; Run model pipeline repeats it live.${S.results.clear?.enhanced?' Enhanced audio is not stored: run Clear again before exporting to include it.':''}`);
    showResults();const [,view,stage]=d.route.match(/^#\/(\w+)\/?(\w*)/);router.go(view,stage);
  }catch(e){log('demo','failed',e.message);}
}
function announceDemo(){const d=demo($('demo').value);if(d.id!=='none')log('demo','active',`${d.label}. ${d.faults||d.force?'Injected test faults, not model inference.':'No injected faults; real models.'}`);}
$('validate').onclick=()=>{try{if(!S.audio)throw Error('Load a source first');const plan=validateTimeline(JSON.parse($('timeline').value),S.audio.duration);renderSlots(plan);log('timeline','passed',`${plan.seconds*30} frames; exact ${plan.seconds}s; any previous voice-over attachments reset`);}catch(e){log('timeline','failed',e.message);}};
async function attachVoice(blob){if(!S.audio)throw Error('Load a source first');const plan=validateTimeline(JSON.parse($('timeline').value),S.audio.duration),index=Number($('slot').value),s=plan.segments[index];if(!s||!('hold'in s))throw Error('Select a silent slot');const voice=await decode(blob);if(voice.duration>s.frames/30+.01)throw Error(`Recording is ${voice.duration.toFixed(2)}s; slot is ${(s.frames/30).toFixed(2)}s. Trim and re-import.`);voices.set(index,voice);$('voice-status').textContent=`Voice-over attached to slot ${index+1}: ${voice.duration.toFixed(2)} seconds.`;}
$('voice').onchange=async()=>{try{await attachVoice($('voice').files[0]);}catch(e){$('voice-status').textContent=e.message;}};
$('record').onclick=async()=>{try{if(recorder?.state==='recording')throw Error('Recording already active');if(!$('slot').options.length)throw Error('Validate a timeline first');recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});recorder=new MediaRecorder(recordingStream);const parts=[];recorder.ondataavailable=e=>parts.push(e.data);recorder.onstop=async()=>{recordingStream.getTracks().forEach(t=>t.stop());try{await attachVoice(new Blob(parts,{type:recorder.mimeType}));}catch(e){$('voice-status').textContent=e.message;}};recorder.start();$('voice-status').textContent='Recording… stop before the selected slot duration.';}catch(e){recordingStream?.getTracks().forEach(t=>t.stop());$('voice-status').textContent=e.message;}};
$('stop-record').onclick=()=>{if(recorder?.state==='recording')recorder.stop();};
function download(blob,name,label){const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download=name;a.textContent=label||name;a.style.display='block';$('downloads').append(a);return a;}
$('project').onclick=()=>{try{const plan=validateTimeline(JSON.parse($('timeline').value),S.audio.duration);download(new Blob([JSON.stringify({source:S.file.name,workflow:serialize(wf),plan,words:S.words,results:S.results,audit,voiceoversAttached:[...voices.keys()],note:'Voice recordings are not embedded in JSON. Export MP4 or retain original recordings.'},null,2)],{type:'application/json'}),'pipeline-project.json');}catch(e){log('project','failed',e.message);}};
$('export').onclick=()=>operation(exportTimeline);
async function exportTimeline(){if(!S.file)throw Error('Load a source first');const plan=validateTimeline(JSON.parse($('timeline').value),S.audio.duration);log('export','running','Encoding reviewed timeline locally');const result=await exportVideo(S.file,S.audio,plan,voices,p=>{$('progress').value=p;},abort.signal);log('export','passed',`${result.frames} frames; ${result.seconds}s; ${result.width}×${result.height}; ${result.voiceovers} voice-over inserts`);download(result.blob,`pipeline-${plan.seconds}s.mp4`,'Download exported MP4');window.lastExport={frames:result.frames,seconds:result.seconds,width:result.width,height:result.height};}
addEventListener('pagehide',()=>{abort?.abort();recordingStream?.getTracks().forEach(t=>t.stop());for(const url of urls)URL.revokeObjectURL(url);if(previewURL)URL.revokeObjectURL(previewURL);});
