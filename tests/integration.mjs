// Integration: real stage modules + engine + planner, with stubbed model frames and audio.
import assert from 'node:assert/strict';
import {runPipeline} from '../site/pipeline/engine.js';
import {steps} from '../site/pipeline/steps.js';
import {selection} from '../site/pipeline/graph.js';
import {validateTimeline} from '../site/failover.js';

const words=Array.from({length:120},(_,i)=>({text:i%10===9?`word${i}.`:`word${i}`,start:i*0.5,end:i*0.5+0.4}));
const audio={duration:61,length:61*48000,getChannelData:()=>new Float32Array(16)};
function harness({models={},force=false,laya}={}){
  const S={file:{name:'clip.mp4'},audio,words:[],sentences:[],results:{},preferred:[],clipsFailed:false,speech:null},logs=[],calls=[];let plan=null,exported=0;
  const setWords=v=>{S.words=v.map(w=>({text:w.text,start:w.start,end:w.end}));S.sentences=[];let g=[];for(const w of S.words){g.push(w);if(/[.!?]$/.test(w.text)){S.sentences.push({text:g.map(x=>x.text).join(' '),start:g[0].start,end:w.end});g=[];}}};
  const ctx={S,log:(stage,status,detail)=>logs.push(`${stage}: ${status} — ${detail}`),
    async attempt(id,payload,fallback){calls.push(id);ctx.log(id,'running','');const m=models[id];try{if(!m)throw Error(`${id} offline`);const v=await m(payload);ctx.log(id,'passed','');return v;}catch(e){ctx.log(id,'failed',e.message);return fallback(e);}},
    async decision(){if(!laya)throw Error('Laya requires consent');const v=await laya();ctx.log('Laya',v.needsReview?'needs review':'fallback passed',v.choice);return {value:v,index:Number(v.choice.split('_')[1])};},
    setWords,setPlan:p=>{plan=validateTimeline(p,audio.duration);},showResults:()=>{},speech:async()=>({samples:new Float32Array(16),sampleRate:16000}),
    force:()=>force,length:()=>45,hasTimeline:()=>!!plan,exportVideo:async()=>{exported++;ctx.log('export','passed','')}};
  return {ctx,S,logs,calls,get plan(){return plan;},get exported(){return exported;}};
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
