// Workflows: which stages run and what each runs after. A workflow is {id, label, detail, builtin?, stages:{id:{on, deps}}}
// over the fixed stage set in graph.js. Edits are pure functions returning a new workflow, and every change keeps the
// graph acyclic. issues() explains, per stage, inputs nothing upstream provides, before anything runs.
import {NODES,order,descendants} from './graph.js';

const ids=NODES.map(n=>n.id),byId=new Map(NODES.map(n=>[n.id,n]));
const label=id=>byId.get(id).label;

function make({id,label,detail,builtin=false,off=[],deps={}}){
  return {id,label,detail,builtin,stages:Object.fromEntries(NODES.map(n=>[n.id,{on:!off.includes(n.id),deps:[...(deps[n.id]??n.deps)]}]))};
}
export const WORKFLOWS=[
  make({id:'full',label:'Full pipeline',builtin:true,detail:'Every stage: transcript, language, fillers, alignment, highlights with Laya failover, audio cleanup, timeline and export.'}),
  make({id:'transcript',label:'Transcript only',builtin:true,off:['uhm','clips','laya','clear','review','export'],
    detail:'Voz transcribes, Ear identifies the language and Align refines every word timing. No edit is planned.'}),
  make({id:'quick-cut',label:'Quick cut, no cleanup',builtin:true,off:['uhm','clear'],deps:{review:['clips','laya']},
    detail:'Transcript, alignment and highlights straight to a timeline and export; filler detection and speech enhancement are skipped.'}),
  make({id:'imported-cut',label:'Cut from an imported transcript',builtin:true,off:['voz','ear','uhm','align','clear'],deps:{clips:['source'],review:['clips','laya']},
    detail:'No speech models: Clips (or Laya) picks highlights from the transcript you import or the worked example, then the timeline and export.'}),
  make({id:'audio-cleanup',label:'Audio cleanup only',builtin:true,off:['voz','ear','uhm','align','clips','laya','review','export'],
    detail:'Only Clear runs, enhancing the speech in the source.'}),
];
export const workflow=id=>WORKFLOWS.find(w=>w.id===id);

// Stage list for the engine and views: only included stages, with edges to excluded stages dropped.
export function active(w){
  const on=new Set(ids.filter(id=>w.stages[id].on));
  return NODES.filter(n=>on.has(n.id)).map(n=>({...n,deps:w.stages[n.id].deps.filter(d=>on.has(d))}));
}
// Every stage with the workflow's edges, for layout (excluded stages keep their place so they can be re-added).
export const nodes=w=>NODES.map(n=>({...n,deps:[...w.stages[n.id].deps]}));
export const included=(w,id)=>!!w.stages[id]?.on;

const clone=w=>({...w,builtin:false,stages:Object.fromEntries(ids.map(id=>[id,{on:w.stages[id].on,deps:[...w.stages[id].deps]}]))});

// Why from → to cannot be added, or null when it can.
export function canConnect(w,from,to){
  if(!byId.has(from)||!byId.has(to))return 'Unknown stage';
  if(from===to)return `${label(to)} cannot run after itself`;
  if(to==='source')return 'Source is always first';
  if(w.stages[to].deps.includes(from))return `${label(to)} already runs after ${label(from)}`;
  if(descendants(to,nodes(w)).has(from))return `${label(from)} already runs after ${label(to)}; that would make a loop`;
  return null;
}
export function connect(w,from,to){const why=canConnect(w,from,to);if(why)throw Error(why);const next=clone(w);next.stages[to].deps.push(from);return next;}
export function disconnect(w,from,to){const next=clone(w);next.stages[to].deps=next.stages[to].deps.filter(d=>d!==from);return next;}
// Excluding a stage reconnects what ran after it to what it ran after, so the chain stays in order.
export function setIncluded(w,id,on){
  if(id==='source'&&!on)throw Error('Source is always part of the workflow');
  const next=clone(w);next.stages[id].on=on;
  if(!on)for(const other of ids)if(next.stages[other].deps.includes(id))for(const d of next.stages[id].deps)if(!next.stages[other].deps.includes(d)&&!canConnect(next,d,other))next.stages[other].deps.push(d);
  return next;
}
export const same=(a,b)=>ids.every(id=>a.stages[id].on===b.stages[id].on&&[...a.stages[id].deps].sort().join()===[...b.stages[id].deps].sort().join());

// Problems a run would hit, per included stage; a missing input is reported once, at the first stage that needs it. 'warn': the stage will stop unless the material supplies the input;
// 'info': it runs, without something it could use.
// `have` lists inputs the loaded material already supplies ('words' for a transcript, 'timeline'): those become notes.
export function issues(w,{have=[]}={}){
  const list=active(w),out=[],has=new Map();
  for(const n of order(list)){const up=new Set(n.deps.flatMap(d=>[...has.get(d),...(byId.get(d).gives??[])]));has.set(n.id,up);
    for(const need of byId.get(n.id).needs??[])if(!up.has(need)){
      if(have.includes(need))out.push({stage:n.id,level:'info',message:need==='words'
        ?`${n.label} will use the transcript already loaded; nothing before it in this workflow produces one.`
        :`${n.label} will use the timeline already loaded; nothing before it in this workflow produces one.`});
      else out.push({stage:n.id,level:'warn',message:need==='words'
        ?`${n.label} needs a transcript: connect Voz or Align before it, or import a transcript or load a worked example first.`
        :`${n.label} needs a timeline: connect Timeline before it, or load a worked example first.`});
      up.add(need);
    }
    for(const use of byId.get(n.id).uses??[])if(!up.has(use)){const m={
      language:'Align will assume English: connect Ear before it to use the detected language.',
      'clips-failure':'Laya only runs when Clips fails before it, or when you run Laya directly: connect Clips before it.',
      highlights:'Timeline will use a complete-sentence proposal: connect Clips or Laya before it for highlights.',
      audio:null}[use];if(m)out.push({stage:n.id,level:'info',message:m});}}
  if(list.length===1)out.push({stage:'source',level:'warn',message:'Only the source is included: add a stage to run.'});
  return out;
}

// Stored or imported workflows are untrusted: unknown stages and bad edges are dropped, loops rejected.
export function parse(value){
  if(!value||typeof value!=='object'||typeof value.stages!=='object'||!value.stages)throw Error('Not a workflow');
  const w={id:String(value.id??'custom').slice(0,60),label:String(value.label??'Custom workflow').trim().slice(0,40)||'Custom workflow',detail:String(value.detail??'').slice(0,300),builtin:false,stages:{}};
  for(const n of NODES){const s=value.stages[n.id];w.stages[n.id]={on:n.id==='source'||(s?.on??false)===true,deps:Array.isArray(s?.deps)?[...new Set(s.deps.filter(d=>byId.has(d)&&d!==n.id&&n.id!=='source'))]:[]};}
  order(nodes(w));
  return w;
}
export const serialize=w=>({id:w.id,label:w.label,detail:w.detail,stages:w.stages});
