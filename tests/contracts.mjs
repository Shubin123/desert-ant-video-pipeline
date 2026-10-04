// Model contract e2e: every model runtime is replaced by a stub served in its place, so the real app, runner realm,
// result validation, fallbacks and cancel run deterministically without downloads. Stubs are labeled test doubles,
// never model inference. Covers malformed outputs, payload contracts (Ear language → Align), hangs, edited timelines.
import {execFileSync} from 'node:child_process';
import {start,loadExample,audit,runStage,tones,waitIdle,check,finish,out} from './lib/harness.mjs';

const HEALTHY={
  voz:`async transcribe(file){rec({file:file?.name});const j=await(await fetch('examples/2b.json')).json();return {words:j.words};}`,
  ear:`async identify(samples,rate){rec({rate,n:samples.length});return {language:'de',confidence:.97};}`,
  uhm:`async analyze(samples,rate){rec({rate});return {fillers:[{start:1,end:1.2}]};}`,
  align:`async refine(samples,rate,words,language){rec({rate,language,n:words.length});return words.map(w=>({start:w.start,end:w.end}));}`,
  clips:`async clips(sentences){rec({n:sentences.length});return [{lo:0,hi:0,score:.9}];}`,
  clear:`async enhance(samples,rate){rec({rate,n:samples.length});return {samples,sampleRate:rate};}`,
};
let impl={...HEALTHY};
const stub=id=>`const rec=x=>{try{(parent.__calls??=[]).push({id:${JSON.stringify(id)},...x});}catch{}};export async function load(){return {${impl[id]}};}`;
const results=[],h=await start(),{page,base}=h;
await page.route('**/models/*/runtime.js',route=>{const id=route.request().url().match(/models\/(\w+)\/runtime\.js/)[1];route.fulfill({contentType:'text/javascript',body:stub(id)});});
const calls=()=>page.evaluate(()=>window.__calls??[]);
const since=async before=>(await audit(page)).split('\n').slice(before);
const lines=async()=>(await audit(page)).split('\n').length;
try{
  await page.goto(base);await loadExample(page);

  // Healthy stubs: Analyze runs every model once in order, Laya sits out, Ear's language reaches Align, no realms leak.
  {const before=await lines();await page.evaluate(()=>{window.__calls=[];});await page.locator('#analyze').click();await waitIdle(page,120000);
   const log=await since(before),c=await calls(),t=await tones(page);
   check(results,'healthy: all six stubs pass validation',['voz','ear','uhm','align','clips','clear'].every(id=>log.includes(`${id}: passed — Real model inference completed`)),log.filter(l=>/failed|attention/.test(l)).join(' | '));
   check(results,'healthy: models run one at a time in graph order',c.map(x=>x.id).join()==='voz,ear,uhm,align,clips,clear',c.map(x=>x.id).join());
   check(results,'healthy: Align receives the language Ear identified',c.find(x=>x.id==='align')?.language==='de',JSON.stringify(c.find(x=>x.id==='align')));
   check(results,'healthy: Ear/Uhm/Align get 16 kHz speech, Clear gets 48 kHz',c.filter(x=>['ear','uhm','align'].includes(x.id)).every(x=>x.rate===16000)&&c.find(x=>x.id==='clear')?.rate===48000);
   check(results,'healthy: Laya not needed, Timeline ready',t.laya==='idle'&&t.review==='passed'&&log.some(l=>l.startsWith('review: ready')),JSON.stringify(t));
   check(results,'healthy: no model iframes left behind',await page.locator('iframe').count()===0);
   const r=JSON.parse(await page.locator('#results').textContent());
   check(results,'healthy: results record provider, language, enhancement',r.transcriptionProvider==='Desert Ant Voz'&&r.ear?.language==='de'&&r.clear?.enhanced===true,JSON.stringify({p:r.transcriptionProvider,ear:r.ear,clear:r.clear}));}

  // Malformed outputs are rejected by the app, logged with the reason, and the stage falls back instead of using them.
  const malformed=[
    ['voz',`async transcribe(){return {words:[{text:'b',start:2,end:3},{text:'a',start:1,end:2}]};}`,'Transcript has invalid text or timestamps','voz: fallback'],
    ['voz',`async transcribe(){return {words:[{text:'late',start:0,end:99999}]};}`,'Transcript has invalid text or timestamps','voz: fallback'],
    ['ear',`async identify(){return null;}`,'Invalid language result','ear: fallback'],
    ['uhm',`async analyze(){return {fillers:[{start:5,end:1}]};}`,'Invalid filler spans','uhm: skipped'],
    ['uhm',`async analyze(){return {fillers:'none'};}`,'Invalid filler spans','uhm: skipped'],
    ['align',`async refine(s,r,words){return words.slice(1);}`,'Align returned','align: fallback'],
    ['clips',`async clips(){return [{lo:0,hi:99999,score:1}];}`,'Invalid highlight scores',null],
    ['clips',`async clips(){return [];}`,'Invalid highlight scores',null],
    ['clips',`async clips(){return [{lo:0,hi:0,score:NaN}];}`,'Invalid highlight scores',null],
    ['clear',`async enhance(samples,rate){samples[10]=NaN;return {samples,sampleRate:rate};}`,'Invalid enhanced audio output','clear: fallback'],
    ['clear',`async enhance(samples){return {samples,sampleRate:16000};}`,'Invalid enhanced audio output','clear: fallback'],
    ['clear',`async enhance(){return {samples:new Float32Array(10),sampleRate:48000};}`,'Invalid enhanced audio output','clear: fallback'],
    ['clips',`async clips(){throw Error('kaboom from stub');}`,'kaboom from stub',null],
    ['ear',`async identify(){throw 'a string, not an Error';}`,'a string, not an Error','ear: fallback'],
  ];
  for(const [id,body,reason,fallback] of malformed){
    impl={...HEALTHY,[id]:body};const before=await lines();await runStage(page,id,'stage',120000);const log=await since(before);
    check(results,`malformed ${id}: rejected with "${reason}"`,log.some(l=>l.startsWith(`${id}: failed — `)&&l.includes(reason))&&!log.some(l=>l.startsWith(`${id}: passed`)),log.join(' | '));
    if(fallback)check(results,`malformed ${id}: falls back (${fallback})`,log.some(l=>l.startsWith(fallback)));
    check(results,`malformed ${id}: run ends cleanly`,!log.some(l=>l.startsWith('pipeline: needs attention')),log.at(-1));
  }
  impl={...HEALTHY};
  // Clear output that was rejected must leave the original audio for export: export still succeeds frame-exact further down.

  // A hung model can be cancelled: the run stops, the realm is torn down, controls come back.
  {impl={...HEALTHY,voz:`async transcribe(){rec({hung:true});return new Promise(()=>{});}`};const before=await lines();
   await page.evaluate(()=>{location.hash='#/graph/voz';});await page.locator('#stage-detail [data-run="stage"]').click();
   await page.waitForFunction(()=>(window.__calls??[]).some(c=>c.hung),null,{timeout:60000});
   check(results,'hang: model realm exists while running',await page.locator('iframe').count()===1);
   await page.locator('#cancel').click();await waitIdle(page,10000);const log=await since(before);
   check(results,'hang: cancel logs pipeline cancelled',log.some(l=>l.startsWith('pipeline: cancelled')),log.join(' | '));
   check(results,'hang: cancel is not reported as a model failure or fallback',!log.some(l=>/^voz: (failed|fallback)/.test(l)));
   check(results,'hang: realm removed and controls enabled',await page.locator('iframe').count()===0&&await page.locator('#analyze').isEnabled()&&await page.locator('#export').isEnabled());
   impl={...HEALTHY};}

  // Hand-edited timelines are re-validated at export; nothing is encoded or offered for download when invalid.
  {const plan=JSON.parse(await page.locator('#timeline').inputValue()),dl=()=>page.locator('#downloads a').count();
   const attempts=[
     ['one frame short',{...plan,segments:plan.segments.map((s,i)=>i===0?{...s,frames:s.frames-1}:s)},'Expected 1350 frames, found 1349'],
     ['excerpt past the source',{...plan,segments:plan.segments.map(s=>'hold' in s?s:{...s,start:s.start+9999,end:s.end+9999})},'Excerpt is outside the source'],
     ['speed change',{...plan,segments:plan.segments.map((s,i,a)=>i===a.findIndex(x=>!('hold' in x))?{...s,end:s.end+1}:s)},'preserves narration speed'],
     ['wrong target',{...plan,seconds:60},'45 or 120'],
   ];
   for(const [name,bad,reason] of attempts){const before=await lines(),n=await dl();await page.locator('#timeline').fill(JSON.stringify(bad));await page.locator('#export').click();await waitIdle(page,30000);const log=await since(before);
     check(results,`edited timeline (${name}) refused at export`,log.some(l=>l.startsWith('pipeline: needs attention')&&l.includes(reason))&&!log.some(l=>l.startsWith('export: running'))&&await dl()===n,log.join(' | '));}
   const before=await lines();await page.locator('#timeline').fill('{not json');await page.locator('#validate').click();
   check(results,'malformed JSON timeline reported, not thrown',(await since(before)).some(l=>l.startsWith('timeline: failed')));
   await page.locator('#timeline').fill(JSON.stringify(plan,null,2));}

  // Voice-over attachments are tied to a validated timeline: re-validating resets them, and the project JSON says so.
  {execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1','-ar','48000',`${out}/contract-tone.wav`]);
   const project=async()=>{await page.locator('#project').click();return page.evaluate(async()=>{const a=[...document.querySelectorAll('#downloads a')].at(-1);return (await fetch(a.href)).json();});};
   await page.locator('#validate').click();await page.locator('#voice').setInputFiles(`${out}/contract-tone.wav`);
   await page.waitForFunction(()=>document.querySelector('#voice-status').textContent.includes('attached'),null,{timeout:10000});
   const a=await project();await page.locator('#validate').click();const b=await project();
   check(results,'project JSON lists the attached voice-over',a.voiceoversAttached?.length===1&&!JSON.stringify(a).includes('RIFF'),JSON.stringify(a.voiceoversAttached));
   check(results,'re-validating the timeline resets attachments',Array.isArray(b.voiceoversAttached)&&b.voiceoversAttached.length===0,JSON.stringify(b.voiceoversAttached));
   // Slot 2 of the 2b plan is an excerpt; force the picker onto it as a stale or tampered option would.
   const voiceErr=await page.evaluate(()=>{document.querySelector('#voice-status').textContent='';const s=document.querySelector('#slot');s.replaceChildren(Object.assign(document.createElement('option'),{value:'1',textContent:'x'}));return true;});
   await page.locator('#voice').setInputFiles([]);await page.evaluate(()=>{document.querySelector('#voice-status').textContent='';});
   await page.locator('#voice').setInputFiles(`${out}/contract-tone.wav`);
   await page.waitForFunction(()=>/Select a silent slot|attached/.test(document.querySelector('#voice-status').textContent),null,{timeout:10000});
   check(results,'voice-over cannot be attached to an excerpt segment',voiceErr&&(await page.locator('#voice-status').textContent()).includes('Select a silent slot'),await page.locator('#voice-status').textContent());
   await page.locator('#validate').click();}

  // After all the rejected outputs above, export still produces the exact length from the original material.
  {await page.evaluate(()=>{window.lastExport=null;});await page.locator('#export').click();await waitIdle(page,600000);const e=await page.evaluate(()=>window.lastExport);
   check(results,'export after rejected outputs is frame-exact',e?.frames===1350&&e?.seconds===45,JSON.stringify(e));}

  // Demo projects: choosing one switches the whole app to its recorded run — source, grid and graph states, stage
  // histories, audit, results, timeline, voice-over slots, route — and its conditions reproduce it on a live re-run.
  {const {DEMOS}=await import('../site/pipeline/demos.js'),{DEMO_TONES}=await import('./lib/demos.mjs'),{createStatus}=await import('../site/ui/status.js'),fs=await import('node:fs');
   const listed=await page.locator('#demo option').evaluateAll(o=>o.map(x=>x.value));
   check(results,'demo dropdown lists every demo, none by default',JSON.stringify(listed)===JSON.stringify(DEMOS.map(d=>d.id))&&await page.locator('#demo').inputValue()==='none',listed.join(','));
   const views=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.stage-card')].map(c=>[c.dataset.stage,[c.dataset.tone,document.querySelector(`#view-graph .node[data-stage="${c.dataset.stage}"]`).dataset.tone,c.querySelector('.state').textContent]])));
   // Wait for this demo's own load line: earlier demos' "loaded" lines stay in the audit until the reset.
   const choose=async id=>{const label=DEMOS.find(d=>d.id===id).label;await page.locator('#demo').selectOption(id);await page.waitForFunction(label=>{const last=document.querySelector('#status').textContent.split('\n').at(-1);return last.startsWith(`demo: loaded — ${label}.`)||last.startsWith('demo: failed');},label);};
   for(const d of DEMOS.filter(d=>d.record)){
     const rec=JSON.parse(fs.readFileSync(new URL(`../site/demos/${d.id}.json`,import.meta.url),'utf8')),st=createStatus();for(const e of rec.audit)st.push(e);
     await page.evaluate(()=>{location.hash='#/grid';});await choose(d.id);
     const v=await views(),log=(await audit(page)).split('\n'),recLines=rec.audit.map(e=>`${e.stage}: ${e.status} — ${e.detail}`);
     check(results,`demo ${d.id}: loads its recording`,log.at(-1).startsWith(`demo: loaded — ${d.label}. Recorded ${rec.date.slice(0,10)} and replayed, not re-run`),log.at(-1));
     check(results,`demo ${d.id}: audit is the recorded run, in order`,JSON.stringify(log.slice(0,-1))===JSON.stringify(recLines),`${log.length-1} vs ${recLines.length} lines`);
     // Stages outside the demo's workflow read "not in workflow" and stay idle.
     const W=await import('../site/pipeline/workflow.js'),flow=W.workflow(d.workflow??'full'),inc=id=>W.included(flow,id);
     const wrong=Object.entries(v).filter(([id,[grid,graph,state]])=>grid!==graph||grid!==(inc(id)?st.get(id).tone:'idle')||state!==(inc(id)?st.get(id).status:'not in workflow')||![(id==='source'?'passed':DEMO_TONES[d.id][id]??'idle')].flat().includes(grid));
     check(results,`demo ${d.id}: selects its workflow`,await page.locator('#workflow').inputValue()===flow.id&&(await page.locator('#workflow-status').textContent())===`${flow.label} · built in`);
     check(results,`demo ${d.id}: every grid card and graph node matches the recording`,wrong.length===0,JSON.stringify(wrong));
     check(results,`demo ${d.id}: timeline, slots and target restored`,JSON.stringify(JSON.parse(await page.locator('#timeline').inputValue()))===JSON.stringify(rec.plan)&&await page.locator('#slot option').count()===rec.plan.segments.filter(s=>'hold' in s).length&&await page.locator('#length').inputValue()===String(rec.plan.seconds));
     const res=JSON.parse(await page.locator('#results').textContent());delete res.transcript;
     check(results,`demo ${d.id}: results restored`,JSON.stringify(res)===JSON.stringify(rec.results)&&(await page.locator('#results').textContent()).includes(rec.words.slice(0,5).map(w=>w.text).join(' ')));
     check(results,`demo ${d.id}: source video loaded`,(await page.locator('#source-status').textContent()).startsWith(`${d.example}.mp4 · ${rec.sourceSeconds.toFixed(2)} seconds`)&&await page.locator('#preview').evaluate(v=>!!v.src));
     const {view,stage}=(await import('../site/ui/router.js')).parse(d.route),here=await page.evaluate(()=>({hash:location.hash,grid:!document.querySelector('#view-grid').hidden,graph:!document.querySelector('#view-graph').hidden,detail:!document.querySelector('#stage-detail').hidden,history:document.querySelector('#stage-detail pre').textContent}));
     check(results,`demo ${d.id}: opens ${d.route}`,here.hash===d.route&&here[view]&&here.detail===!!stage,JSON.stringify(here).slice(0,200));
     if(stage)check(results,`demo ${d.id}: ${stage} panel shows its recorded history`,here.history.split('\n').length===st.get(stage).history.length,`${here.history.split('\n').length} vs ${st.get(stage).history.length}`);
     check(results,`demo ${d.id}: description shown`,(await page.locator('#demo-detail').textContent())===d.detail);
   }
   // Live re-runs of the no-download demos land in exactly the recorded states (all their model calls are faulted).
   for(const d of DEMOS.filter(d=>d.record&&['offline','malformed','voz-fail','clear-rejected','hang'].includes(d.id))){
     const rec=JSON.parse(fs.readFileSync(new URL(`../site/demos/${d.id}.json`,import.meta.url),'utf8')),st=createStatus();for(const e of rec.audit)st.push(e);
     await choose(d.id);await page.evaluate(()=>{window.__calls=[];});const {run,stage,cancel}=d.record;
     if(run==='analyze')await page.locator('#analyze').click();
     else{await page.evaluate(id=>{location.hash=`#/graph/${id}`;},stage);await page.waitForFunction(id=>!document.querySelector('#stage-detail').hidden&&document.querySelector('.node[aria-pressed="true"]')?.dataset.stage===id,stage);await page.locator(`#stage-detail [data-run="${run}"]`).click();}
     if(cancel){await page.waitForFunction(id=>document.querySelector('#status').textContent.includes(`${id}: running — Injected`),stage);await page.locator('#cancel').click();}
     await page.waitForFunction(()=>document.querySelector('#analyze').disabled,null,{timeout:2000}).catch(()=>{});await waitIdle(page,60000);
     const v=await views(),diff=Object.entries(v).filter(([id,[grid]])=>grid!==st.get(id).tone);
     check(results,`demo ${d.id}: live re-run reproduces the recording`,diff.length===0&&(await calls()).length===0,JSON.stringify(diff)+JSON.stringify(await calls()));
   }
   // Switching away: a worked example or 'none' clears demo conditions; a missing recording is reported, not half-loaded.
   await choose('offline');await page.locator('[data-example="2b"]').click();await page.waitForFunction(()=>/^worked example: loaded[^\n]*$/.test(document.querySelector('#status').textContent));
   const t=await tones(page);
   check(results,'worked example resets the demo and its stage states',await page.locator('#demo').inputValue()==='none'&&Object.entries(t).every(([id,x])=>x===(id==='source'?'passed':'idle')),JSON.stringify(t));
   await page.route('**/demos/offline.json',r=>r.fulfill({status:404,body:''}));const before=await lines();
   await page.locator('#demo').selectOption('offline');await page.waitForFunction(n=>document.querySelector('#status').textContent.split('\n').length>n,before);
   check(results,'missing recording is reported and leaves the project as it was',(await since(before)).join('|')==='demo: failed — Demo recording demos/offline.json is missing'&&(await page.locator('#timeline').inputValue()).includes('"seconds": 45'));
   await page.unroute('**/demos/offline.json');await page.locator('#demo').selectOption('none');}

  // Saved layouts are untrusted: corrupt, partial, duplicated or unknown ids never lose or duplicate a stage card.
  for(const [name,value] of [['invalid JSON','{not json'],['a string','"export"'],['an object','{"0":"export"}'],['duplicates and unknown ids','["export","export","nope","__proto__"]'],['empty list','[]']]){
    await page.evaluate(v=>localStorage.setItem('pipeline.grid-order',v),value);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.stage-card').length>=10);
    const ids=await page.evaluate(()=>[...document.querySelectorAll('#view-grid .stage-card')].map(c=>c.dataset.stage));
    check(results,`saved layout (${name}): 10 unique cards`,ids.length===10&&new Set(ids).size===10&&(!name.startsWith('dup')||ids[0]==='export'),ids.join(','));
  }
  await page.evaluate(()=>localStorage.clear());

  // Deep links: unknown stages and views degrade to a sane view instead of a broken panel.
  for(const [hash,view,detail] of [['#/graph/nope','graph',false],['#/bogus','grid',false],['#/bogus/voz','grid',true],['#/graph/%3Cimg%3E','graph',false],['#/graph/__proto__','graph',false]]){
    await page.evaluate(x=>{location.hash=x;},hash);await page.waitForTimeout(50);
    const s=await page.evaluate(()=>({grid:!document.querySelector('#view-grid').hidden,graph:!document.querySelector('#view-graph').hidden,detail:!document.querySelector('#stage-detail').hidden}));
    check(results,`route ${hash}: ${view} view, detail ${detail?'open':'closed'}`,s[view]&&!s[view==='grid'?'graph':'grid']&&s.detail===detail,JSON.stringify(s));
  }
  check(results,'no page errors',h.errors.length===0,h.errors.join('; '));
}catch(e){check(results,'contracts run',false,e.stack);}
finally{await h.close();}
finish(results,'contracts');
