// Integration: real stage modules + engine + planner, with stubbed model frames and audio.
import assert from 'node:assert/strict';
import {runPipeline} from '../site/pipeline/engine.js';
import {steps} from '../site/pipeline/steps.js';
import {selection} from '../site/pipeline/graph.js';
import {validateTimeline} from '../site/failover.js';
import {validateWords} from '../site/pipeline/words.js';

const words=Array.from({length:120},(_,i)=>({text:i%10===9?`word${i}.`:`word${i}`,start:i*0.5,end:i*0.5+0.4}));
const audio={duration:61,length:61*48000,getChannelData:()=>new Float32Array(16)};
function harness({models={},force=false,laya}={}){
  const S={file:{name:'clip.mp4'},audio,words:[],sentences:[],results:{},preferred:[],clipsFailed:false,speech:null},logs=[],calls=[],payloads={};let plan=null,exported=0;
  const setWords=v=>{S.words=validateWords(v,S.audio.duration);S.sentences=[];let g=[];for(const w of S.words){g.push(w);if(/[.!?]$/.test(w.text)){S.sentences.push({text:g.map(x=>x.text).join(' '),start:g[0].start,end:w.end});g=[];}}};
  const ctx={S,log:(stage,status,detail)=>logs.push(`${stage}: ${status} — ${detail}`),
    async attempt(id,payload,fallback){calls.push(id);payloads[id]=payload;ctx.log(id,'running','');const m=models[id];try{if(!m)throw Error(`${id} offline`);const v=await m(payload);ctx.log(id,'passed','');return v;}catch(e){if(e.name==='AbortError')throw e;ctx.log(id,'failed',e.message);return fallback(e);}},
    async decision(){if(!laya)throw Error('Laya requires consent');const v=await laya();ctx.log('Laya',v.needsReview?'needs review':'fallback passed',v.choice);return {value:v,index:Number(v.choice.split('_')[1])};},
    setWords,setPlan:p=>{plan=validateTimeline(p,audio.duration);},showResults:()=>{},speech:async()=>({samples:new Float32Array(16),sampleRate:16000}),
    force:()=>force,length:()=>45,hasTimeline:()=>!!plan,exportVideo:async()=>{exported++;ctx.log('export','passed','')}};
  return {ctx,S,logs,calls,payloads,get plan(){return plan;},get exported(){return exported;}};
}
const allModels={voz:async()=>({words}),ear:async()=>({language:'en'}),uhm:async()=>({fillers:[]}),align:async p=>p.words.map(w=>({...w,start:w.start+0.01})),clips:async()=>[{lo:2,hi:3,score:.9}],clear:async()=>null};

// 1. Full run with every model healthy: Laya sits out, plan is exact, export is not part of Analyze.
{const h=harness({models:allModels});const skipped=[];
 await runPipeline(steps,h.ctx,{only:selection('review','upstream'),onSkip:id=>skipped.push(id)});
 assert.deepEqual(h.calls,['voz','ear','uhm','align','clips','clear']);assert.deepEqual(skipped,['laya']);
 assert.equal(h.plan.seconds,45);assert.equal(h.S.results.transcriptionProvider,'Desert Ant Voz');assert.deepEqual(h.S.preferred,[2,3]);
 assert.ok(Math.abs(h.S.words[0].start-0.01)<1e-9,'Align output replaces word timings');assert.equal(h.exported,0);
 assert.ok(h.logs.at(-1).startsWith('review: ready'));}
// 2. Clips fails -> Laya picks the excerpt.
{const h=harness({models:{...allModels,clips:async()=>{throw Error('OOM');}},laya:async()=>({choice:'excerpt_4',confidence:.8})});
 await runPipeline(steps,h.ctx,{only:selection('review','upstream')});
 assert.ok(h.logs.includes('clips: failed — OOM'));assert.deepEqual(h.S.preferred,[4]);assert.ok(h.logs.some(l=>l.startsWith('Laya: fallback passed')));}
// 3. Clips and Laya both fail -> deterministic proposal, still a valid plan.
{const h=harness({models:{...allModels,clips:async()=>{throw Error('OOM');}}});
 await runPipeline(steps,h.ctx,{only:selection('review','upstream')});
 assert.ok(h.logs.some(l=>l.startsWith('Laya: unavailable')));assert.ok(h.logs.some(l=>l.startsWith('clips: fallback')));assert.equal(h.plan.seconds,45);}
// 4. Every model offline but transcript imported -> every fallback path, plan produced.
{const h=harness({});h.ctx.setWords(words);
 await runPipeline(steps,h.ctx,{only:selection('review','upstream')});
 for(const id of ['voz','ear','uhm','align','clear'])assert.ok(h.logs.includes(`${id}: failed — ${id} offline`),id);
 assert.equal(h.S.results.transcriptionProvider,'Imported transcript');assert.equal(h.plan.seconds,45);}
// 5. No transcript and Voz down -> run stops with a clear message, nothing invented.
{const h=harness({});await assert.rejects(runPipeline(steps,h.ctx,{only:selection('review','upstream')}),/Laya cannot invent missing speech/);assert.equal(h.plan,null);}
// 6. Graph runs: single stage, up-to-here, from-here, and missing inputs.
{const h=harness({models:allModels});
 await assert.rejects(runPipeline(steps,h.ctx,{only:selection('clips','stage'),target:'clips'}),/Clips needs a transcript/);
 await runPipeline(steps,h.ctx,{only:selection('ear','stage'),target:'ear'});assert.deepEqual(h.calls,['ear']);
 await runPipeline(steps,h.ctx,{only:selection('align','upstream'),target:'align'});assert.deepEqual(h.calls,['ear','voz','ear','align']);
 h.calls.length=0;await runPipeline(steps,h.ctx,{only:selection('clips','downstream'),target:'clips'});
 assert.deepEqual(h.calls,['clips']);assert.equal(h.plan.seconds,45);assert.equal(h.exported,1,'run from Clips continues through Timeline to Export');
 await runPipeline(steps,h.ctx,{only:selection('laya','stage'),target:'laya'}).catch(e=>assert.fail(e));assert.ok(h.logs.some(l=>l.startsWith('Laya: unavailable')),'Laya runs when chosen explicitly');}
// 7. Export alone needs a timeline.
{const h=harness({});h.S.audio=audio;await assert.rejects(runPipeline(steps,h.ctx,{only:selection('export','stage'),target:'export'}),/Export needs a timeline/);}
// 8. Cancellation between stages stops the run.
{const h=harness({models:allModels}),ac=new AbortController();h.ctx.signal=ac.signal;const voz=allModels.voz;h.ctx.attempt=async(id,p,f)=>{h.calls.push(id);if(id==='voz'){ac.abort();return voz();}return {};};
 await assert.rejects(runPipeline(steps,h.ctx,{only:selection('review','upstream')}),e=>e.name==='AbortError');assert.deepEqual(h.calls,['voz']);}
console.log('PASS: integration — healthy run, Clips→Laya failover, double failure, all-offline fallbacks, no invented speech, graph runs, export guard, cancellation');

// ---- Adversarial integration cases ----
const abortError=()=>new DOMException('Cancelled','AbortError');
const excerpts=plan=>plan.segments.filter(s=>!('hold' in s));
// 9. Align uses the language Ear identified, and English only when Ear fell back.
{const h=harness({models:{...allModels,ear:async()=>({language:'de'})}});await runPipeline(steps,h.ctx,{only:selection('align','upstream')});assert.equal(h.payloads.align.language,'de');
 const f=harness({models:{...allModels,ear:async()=>{throw Error('down');}}});await runPipeline(steps,f.ctx,{only:selection('align','upstream')});assert.equal(f.payloads.align.language,'en');assert.ok(f.logs.some(l=>l.startsWith('ear: fallback')));}
// 10. Cancelling inside a model is a cancel, never a fallback: Clips must not hand over to Laya, Laya must not fall back to the proposal.
{const h=harness({models:{...allModels,clips:async()=>{throw abortError();}},laya:async()=>({choice:'excerpt_1',confidence:.9})});
 await assert.rejects(runPipeline(steps,h.ctx,{only:selection('review','upstream')}),e=>e.name==='AbortError');
 assert.ok(!h.calls.includes('clear')&&h.plan===null&&!h.logs.some(l=>/^(Laya|clips: failed)/.test(l)),h.logs.join('\n'));}
{const h=harness({models:{...allModels,clips:async()=>{throw Error('OOM');}},laya:async()=>{throw abortError();}});
 await assert.rejects(runPipeline(steps,h.ctx,{only:selection('review','upstream')}),e=>e.name==='AbortError');assert.ok(!h.logs.some(l=>l.startsWith('clips: fallback')),'no deterministic proposal after a cancel');}
// 11. Forced failure demo: the Clips model is never called, Laya decides, and its excerpt is in the plan.
{const h=harness({models:allModels,force:true,laya:async()=>({choice:'excerpt_5',confidence:.9})});
 await runPipeline(steps,h.ctx,{only:selection('review','upstream')});
 assert.ok(!h.calls.includes('clips'));assert.ok(h.logs.includes('clips: failed — Intentional failure demonstration requested'));
 assert.ok(excerpts(h.plan).some(s=>s.topic===h.S.sentences[5].text),'Laya choice is used');}
// 12. A recovered Clips clears the earlier failure, so Laya sits out the next run.
{const models={...allModels,clips:async()=>{throw Error('OOM');}},h=harness({models});
 await runPipeline(steps,h.ctx,{only:selection('review','upstream')});assert.ok(h.S.clipsFailed);
 models.clips=allModels.clips;const skipped=[];await runPipeline(steps,h.ctx,{only:selection('clips','downstream'),target:'clips',onSkip:id=>skipped.push(id)});
 assert.equal(h.S.clipsFailed,false);assert.deepEqual(skipped,['laya']);assert.deepEqual(h.S.preferred,[2,3]);}
// 13. Voz output that ends slightly past the audio (decoder padding) still produces an exportable plan.
{const tail=words.map((w,i)=>i===words.length-1?{...w,text:'end.',start:60.95,end:61.09}:w),h=harness({models:{...allModels,voz:async()=>({words:tail}),clips:async()=>[{lo:11,hi:12,score:.9}]}});
 await runPipeline(steps,h.ctx,{only:selection('review','upstream')});
 assert.ok(h.S.words.every(w=>w.end<=audio.duration));assert.doesNotThrow(()=>validateTimeline(h.plan,audio.duration));}
// 14. Bad model output never becomes the transcript: Voz words out of order stop the stage with the import message.
{const h=harness({models:{...allModels,voz:async()=>({words:[{text:'b',start:2,end:3},{text:'a',start:1,end:2}]})}});
 await assert.rejects(runPipeline(steps,h.ctx,{only:selection('voz','stage'),target:'voz'}),/invalid text or timestamps/);assert.deepEqual(h.S.words,[]);}
// 15. Align that crosses words is repaired, not discarded, and the audit says how many were kept.
{const h=harness({models:{...allModels,align:async p=>p.words.map((w,i)=>i===10?{start:w.start+3,end:w.end+3}:{start:w.start+.01,end:w.end+.01})}});
 await runPipeline(steps,h.ctx,{only:selection('align','upstream')});
 assert.deepEqual(h.S.results.align,{refined:119,reverted:1});assert.equal(h.S.words[10].start,5);assert.ok(h.logs.some(l=>l.startsWith('align: passed — 119 of 120 words refined')));}
// 16. Clear replaces the export audio only with a valid enhancement; a wrong sample rate stops the stage.
{const real=globalThis.AudioBuffer;
 globalThis.AudioBuffer=class{constructor({length,sampleRate}){this.length=length;this.sampleRate=sampleRate;this.duration=length/sampleRate;this.data=new Float32Array(length);}getChannelData(){return this.data;}copyToChannel(src){this.data.set(src);}};
 try{
  const small={duration:2,length:96000,getChannelData:()=>new Float32Array(96000)},h=harness({models:{...allModels,clear:async p=>({samples:p.samples.map(()=>.5),sampleRate:48000})}});h.S.audio=small;
  await runPipeline(steps,h.ctx,{only:selection('clear','stage'),target:'clear'});
  assert.notEqual(h.S.audio,small);assert.equal(h.S.audio.getChannelData()[95999],.5);assert.deepEqual(h.S.results.clear,{sampleRate:48000,duration:2,enhanced:true});
  const bad=harness({models:{...allModels,clear:async()=>({samples:new Float32Array(10),sampleRate:16000})}});bad.S.audio=small;
  await assert.rejects(runPipeline(steps,bad.ctx,{only:selection('clear','stage'),target:'clear'}),/Invalid enhanced audio output/);assert.equal(bad.S.audio,small,'original audio kept');
 }finally{globalThis.AudioBuffer=real;}}
// 17. Timeline length follows the selected target, and every plan the stages build is exact.
for(const seconds of [45,120]){const h=harness({models:allModels});h.ctx.length=()=>seconds;await runPipeline(steps,h.ctx,{only:selection('review','upstream')});assert.equal(h.plan.segments.reduce((n,s)=>n+s.frames,0),seconds*30);}
console.log('PASS: integration edge cases — Ear language reaches Align, cancels are not fallbacks, forced failover, Clips recovery, padded Voz ends, invalid Voz/Clear output, Align repair audit, 45/120 s plans');

// ---- Workflows: the real stages run exactly what the workflow includes, in its order ----
{const W=await import('../site/pipeline/workflow.js');
 // Mirrors app.js Analyze: up to the timeline when the workflow has one, otherwise every included stage but export.
 const analyze=(h,w)=>{const list=W.active(w),only=list.some(n=>n.id==='review')?selection('review','upstream',list):new Set(list.filter(n=>n.id!=='export').map(n=>n.id));return runPipeline(steps,h.ctx,{nodes:list,only});};
 {const h=harness({models:allModels});await analyze(h,W.workflow('transcript'));assert.deepEqual(h.calls,['voz','ear','align']);assert.equal(h.plan,null,'no timeline in a transcript workflow');assert.equal(h.payloads.align.language,'en');}
 {const h=harness({models:allModels});await analyze(h,W.workflow('audio-cleanup'));assert.deepEqual(h.calls,['clear']);}
 {const h=harness({models:allModels});await analyze(h,W.workflow('quick-cut'));assert.deepEqual(h.calls,['voz','ear','align','clips']);assert.equal(h.plan.seconds,45);}
 {const h=harness({models:allModels});h.ctx.setWords(words);await analyze(h,W.workflow('imported-cut'));assert.deepEqual(h.calls,['clips']);assert.deepEqual(h.S.preferred,[2,3]);assert.equal(h.plan.seconds,45);}
 {const h=harness({models:allModels});await assert.rejects(analyze(h,W.workflow('imported-cut')),/Clips needs a transcript/,'the warned-about input really is missing at run time');}
 // Edits change execution order: Align after Uhm runs Uhm first; excluding Align feeds Clips the Voz words.
 {const h=harness({models:allModels});await analyze(h,W.connect(W.workflow('full'),'uhm','align'));assert.deepEqual(h.calls.slice(0,4),['voz','ear','uhm','align']);}
 {const h=harness({models:{...allModels,align:async()=>{throw Error('should not run');}}});await analyze(h,W.setIncluded(W.workflow('full'),'align',false));
  assert.ok(!h.calls.includes('align'));assert.equal(h.S.words[0].start,0,'Voz timings kept');assert.equal(h.plan.seconds,45);}
 // A graph run only reaches included stages: running up to Timeline in quick-cut never touches Uhm or Clear.
 {const h=harness({models:allModels}),w=W.workflow('quick-cut');await runPipeline(steps,h.ctx,{nodes:W.active(w),only:selection('review','upstream',W.active(w)),target:'review'});assert.ok(!h.calls.includes('uhm')&&!h.calls.includes('clear'));}
 // Within a workflow, a failing Clips still hands over to the connected Laya.
 {const h=harness({models:{...allModels,clips:async()=>{throw Error('OOM');}},laya:async()=>({choice:'excerpt_1',confidence:.9})}),skipped=[];
  await runPipeline(steps,h.ctx,{nodes:W.active(W.workflow('full')),only:selection('review','upstream'),onSkip:id=>skipped.push(id)});assert.deepEqual(h.S.preferred,[1],'connected Laya takes over');}}
console.log('PASS: integration workflows — transcript, audio cleanup, quick cut, imported cut, reordered and excluded stages, graph runs within a workflow');
