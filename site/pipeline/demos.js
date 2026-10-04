// Demo projects. Choosing one restores a recorded run of this app (site/demos/<id>.json, written by
// tools/record-demos.mjs): source video, transcript, results, timeline, audit, and every stage's status in the grid
// and graph, then opens the view the demo is about. Nothing is re-run on load; "Run model pipeline" repeats it live.
// `faults` replace a stage's model call with fault(payload, signal) while the demo is active; the output still goes
// through normal result validation and is logged as injected, never as model inference. Stages without a fault run
// the real model. `record` tells the recorder how the run was made: 'analyze' (panel 2), or a graph run of `stage`.
// `workflow` (default 'full') is the built-in workflow the demo ran under; loading the demo selects it.
const STAGES=['voz','ear','uhm','align','clips','clear'];
const fail=message=>()=>{throw Error(`Injected test fault: ${message}`);};

export const DEMOS=[
  {id:'none',label:'None · your own video or a worked example',detail:'No demo conditions. Every stage runs its original model.'},
  {id:'full-2b',label:'Full pipeline, every model healthy',example:'2b',route:'#/grid',record:{run:'analyze',export:true},
    detail:'All six models ran for real on the 2b material, Laya was not needed, and the timeline was exported frame-exact.'},
  {id:'transcript-only',label:'Transcript only workflow',example:'2b',workflow:'transcript',route:'#/graph',record:{run:'analyze'},
    detail:'Under the Transcript only workflow, Voz, Ear and Align ran for real; no other stage is part of the workflow, so no edit was planned.'},
  {id:'imported-cut',label:'Cut from an imported transcript',example:'2b',workflow:'imported-cut',route:'#/graph',record:{run:'analyze'},
    detail:'No speech models: the worked-example transcript went straight to Clips, which ran for real, then to the timeline.'},
  {id:'audio-cleanup',label:'Audio cleanup only workflow',example:'2b',workflow:'audio-cleanup',route:'#/graph/clear',record:{run:'analyze'},
    detail:'Under the Audio cleanup only workflow, Clear ran for real on the source speech; nothing else is part of the workflow.'},
  {id:'clips-fail',label:'Clips fails → real Laya picks the excerpt',example:'2b',route:'#/graph/laya',force:true,record:{run:'analyze',laya:true},
    detail:'Clips is marked failed without running; the hosted Laya model chose the excerpt from the transcript text. Other models ran for real.'},
  {id:'offline',label:'Every model offline',example:'2b',route:'#/grid',record:{run:'analyze'},faults:Object.fromEntries(STAGES.map(id=>[id,fail(`${id} model download failed`)])),
    detail:'All six models fail to load, so every fallback runs: worked-example transcript, English, all speech retained, original timestamps, complete-sentence proposal, original audio.'},
  {id:'malformed',label:'Every model returns malformed output',example:'2b',route:'#/grid',record:{run:'analyze'},
    faults:{
      voz:()=>({words:[{text:'later',start:2,end:3},{text:'earlier',start:1,end:2}]}),
      ear:()=>null,
      uhm:()=>({fillers:[{start:5,end:1}]}),
      align:p=>p.words.slice(1),
      clips:()=>[{lo:0,hi:1e6,score:1}],
      clear:()=>({samples:new Float32Array(10),sampleRate:16000}),
    },
    detail:'Each model answers with output that breaks its contract (out-of-order words, no language, inverted filler spans, a missing word, out-of-range highlights, wrong sample rate). Validation rejects each one and the stage falls back.'},
  {id:'voz-fail',label:'Voz fails → imported transcript',example:'2b',route:'#/graph/voz',record:{run:'stage',stage:'voz'},faults:{voz:fail('Voz crashed')},
    detail:'Voz alone, run from the graph, crashes. The worked-example transcript is used and flagged for review; without one the run would stop, because missing speech is never invented.'},
  {id:'align-crossing',label:'Align returns crossing words',example:'2b',route:'#/graph/align',record:{run:'upstream',stage:'align'},
    faults:{align:p=>p.words.map((w,i)=>i%7===3?{start:w.start+2,end:w.end+2}:{start:w.start+.01,end:w.end+.01})},
    detail:'Run up to Align: Voz and Ear ran for real, then every seventh word jumped 2 s ahead. Align repair kept every refinement that stays in order and reverted only the crossing words.'},
  {id:'clear-rejected',label:'Clear output rejected',example:'2b',route:'#/graph/clear',record:{run:'stage',stage:'clear'},faults:{clear:()=>({samples:new Float32Array(10),sampleRate:16000})},
    detail:'Clear alone, run from the graph, answers with audio at the wrong sample rate and length. It is rejected and the original audio is kept for export.'},
  {id:'hang',label:'Voz never answers → cancelled',example:'2b',route:'#/graph/voz',record:{run:'stage',stage:'voz',cancel:true},
    faults:{voz:(p,signal)=>new Promise((resolve,reject)=>{signal?.throwIfAborted();signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});})},
    detail:'Voz starts and never responds until Cancel is pressed: the run stops, Voz is not reported as failed or fallen back, and the controls come back.'},
];

export const demo=id=>DEMOS.find(d=>d.id===id)??DEMOS[0];
