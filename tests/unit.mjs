import assert from 'node:assert/strict';
import {validateTimeline,planFromSentences,layaChoice} from '../site/failover.js';
const p=planFromSentences([{text:'A full sentence.',start:1,end:6},{text:'Another.',start:8,end:13}],45);
assert.equal(validateTimeline(p,20).seconds,45);
assert.equal(p.segments.reduce((n,s)=>n+s.frames,0),1350);
assert.throws(()=>validateTimeline({...p,seconds:44},20),/45 or 120/);
assert.throws(()=>validateTimeline({...p,segments:[{hold:-1,frames:1350}]},20),/Hold is outside/);
assert.throws(()=>validateTimeline({...p,segments:[{start:0,end:40,frames:1350}]},20),/Excerpt is outside/);
await assert.rejects(layaChoice('text',{a:'one'},{enabled:false}),/consent/);
await assert.rejects(layaChoice('text',{a:'one'},{enabled:true,endpoint:'http://example.com'}),/HTTPS/);
console.log('PASS: exact timelines, invalid boundaries, consent and endpoint safety');
const originalFetch=globalThis.fetch;
try {
 globalThis.fetch=async()=>new Response(JSON.stringify({answers:{selection:{choice:'invented_option',confidence:.9}}}));
 await assert.rejects(layaChoice('text',{a:'one'},{enabled:true,endpoint:'https://example.com'}),/Invalid Laya/);
 globalThis.fetch=async()=>new Response(JSON.stringify({answers:{selection:{choice:'a',confidence:.1}}}));
 assert.equal((await layaChoice('text',{a:'one'},{enabled:true,endpoint:'https://example.com'})).needsReview,true);
 globalThis.fetch=async()=>new Response('Service unavailable',{status:503});
 await assert.rejects(layaChoice('text',{a:'one'},{enabled:true,endpoint:'https://example.com'}),/503/);
 console.log('PASS: injected invalid Laya answer, confidence gate, and server failure');
} finally {globalThis.fetch=originalFetch;}
const {NODES,order,edges,layout}=await import('../site/pipeline/graph.js');
const {runPipeline}=await import('../site/pipeline/engine.js');
const {createStatus}=await import('../site/ui/status.js');
assert.deepEqual(order().map(n=>n.id),['source','voz','ear','uhm','align','clips','laya','clear','review','export']);
assert.throws(()=>order([{id:'a',deps:['b']},{id:'b',deps:['a']}]),/cycle/);
assert.throws(()=>order([{id:'a',deps:['missing']}]),/unknown/);
assert.ok(edges().some(e=>e.from==='clips'&&e.to==='laya'&&e.failover));
const {pos}=layout();for(const n of NODES)for(const d of n.deps)assert.ok(pos.get(d).layer<pos.get(n.id).layer);
const ran=[],skipped=[];
await runPipeline({voz:{run:()=>ran.push('voz')},laya:{when:()=>false,run:()=>ran.push('laya')},clear:{run:()=>ran.push('clear')}},{},{onSkip:id=>skipped.push(id)});
assert.deepEqual(ran,['voz','clear']);assert.deepEqual(skipped,['laya']);
const halted=new AbortController();halted.abort();
await assert.rejects(runPipeline({voz:{run:()=>{}}},{signal:halted.signal}),e=>e.name==='AbortError');
const st=createStatus();st.push({stage:'clips',status:'failed',detail:'x'});st.push({stage:'Laya',status:'needs review',detail:'y'});st.push({stage:'clips',status:'fallback',detail:'z'});
assert.equal(st.get('clips').tone,'fallback');assert.equal(st.get('clips').history.length,2);assert.equal(st.get('laya').tone,'review');assert.equal(st.get('export').tone,'idle');
console.log('PASS: stage graph order, layering, cycle detection, conditional steps, cancellation, status mapping');
const {ancestors,descendants,selection}=await import('../site/pipeline/graph.js');
const {move}=await import('../site/ui/sortable.js');
assert.deepEqual([...ancestors('align')].sort(),['ear','source','voz']);
assert.deepEqual([...descendants('clips')].sort(),['export','laya','review']);
assert.deepEqual([...selection('uhm','stage')],['uhm']);
assert.ok(selection('review','upstream').has('clear')&&!selection('review','upstream').has('export'));
assert.ok(selection('clips','downstream').has('export')&&!selection('clips','downstream').has('voz'));
assert.throws(()=>selection('nope','stage'),/Unknown stage/);assert.throws(()=>selection('voz','sideways'),/Unknown run mode/);
const log2=[];
assert.deepEqual(await runPipeline({voz:{run:()=>log2.push('voz')},ear:{run:()=>log2.push('ear')},align:{run:()=>log2.push('align')}},{},{only:selection('align','upstream')}),['voz','ear','align']);
await assert.rejects(runPipeline({clips:{needs:()=>'a transcript',run:()=>{}}},{},{only:new Set(['clips']),target:'clips'}),/Clips needs a transcript/);
await assert.rejects(runPipeline({},{},{only:new Set(['source']),target:'source'}),/cannot be run on its own/);
const forced=[];await runPipeline({laya:{when:()=>false,run:()=>forced.push('laya')}},{},{only:new Set(['laya']),target:'laya'});
assert.deepEqual(forced,['laya'],'explicitly chosen stage runs even when its condition is false');
assert.deepEqual(move(['a','b','c','d'],0,2),['b','c','a','d']);assert.deepEqual(move(['a','b','c'],2,0),['c','a','b']);assert.deepEqual(move(['a','b'],0,9),['b','a']);
console.log('PASS: graph selections, subset runs, input checks, explicit targets, reorder');
const {repairAlignment,validateWords}=await import('../site/pipeline/words.js');
{const orig=[{text:'a',start:0,end:.4},{text:'b',start:.5,end:.9},{text:'c',start:1,end:1.4},{text:'d',start:1.5,end:1.9}];
 const r=repairAlignment(orig,[{start:.02,end:.4},{start:1.2,end:1.3},{start:1.05,end:1.4},{start:1.55,end:1.9,refined:false}],10);
 assert.deepEqual(r.words.map(w=>w.refined),[true,false,true,false]);assert.equal(r.kept,2);assert.equal(r.words[1].start,.5);
 assert.doesNotThrow(()=>validateWords(r.words,10));
 const crossed=repairAlignment(orig,[{start:0,end:.4},{start:2,end:2.1},{start:.6,end:.7},{start:.65,end:.8}],10);
 assert.doesNotThrow(()=>validateWords(crossed.words,10),'cascading conflicts settle into order');
 assert.equal(repairAlignment(orig,orig.map(w=>({...w,start:NaN})),10).kept,0);
 assert.throws(()=>repairAlignment(orig,orig.slice(1),10),/3 words for 4/);
 for(let t=0;t<200;t++){const o=Array.from({length:30},(_,i)=>({text:'w'+i,start:i,end:i+.8})),a=o.map(w=>({start:w.start+(Math.random()*4-2),end:w.end+(Math.random()*4-2)}));assert.doesNotThrow(()=>validateWords(repairAlignment(o,a,40).words,40));}}
console.log('PASS: Align repair keeps ordered refinements, reverts only conflicts (200 randomized cases)');

// ---- Adversarial edge cases. Randomized checks use a seeded generator so any failure reproduces with its seed. ----
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const sentencesOf=words=>{const out=[];let g=[];for(const w of words){g.push(w);if(/[.!?]$/.test(w.text)||g.length>=25){out.push({text:g.map(x=>x.text).join(' '),start:g[0].start,end:w.end});g=[];}}if(g.length)out.push({text:g.map(x=>x.text).join(' '),start:g[0].start,end:g.at(-1).end});return out;};

// validateWords: every malformed shape is rejected with the user-facing message, accepted ones are normalised.
assert.throws(()=>validateWords(null,10),/No timestamped words/);assert.throws(()=>validateWords([],10),/No timestamped words/);assert.throws(()=>validateWords({words:[]},10),/No timestamped words/);
for(const bad of [{text:'',start:0,end:1},{text:'  ',start:0,end:1},{text:'a',start:NaN,end:1},{text:'a',start:0,end:Infinity},{text:'a',start:-0.01,end:1},{text:'a',start:2,end:1},{text:'a',start:0,end:10.11},{text:'a',start:'x',end:1}])
  assert.throws(()=>validateWords([bad],10),/invalid text or timestamps/,JSON.stringify(bad));
assert.throws(()=>validateWords([{text:'a',start:2,end:3},{text:'b',start:1,end:4}],10),/invalid text or timestamps/,'out-of-order starts');
assert.deepEqual(validateWords([{word:'  hi ',start:'1',end:'2'},{text:'there',start:1,end:1}],10),[{text:'hi',start:1,end:2},{text:'there',start:1,end:1}],'word key, trimming, numeric strings, equal starts and zero-length words');
assert.deepEqual(validateWords([{text:'end.',start:9.98,end:10.09}],10),[{text:'end.',start:9.98,end:10}],'overshoot within tolerance is clamped to the audio duration');
console.log('PASS: validateWords rejects malformed words and clamps tolerated overshoot');

// validateTimeline: boundaries are exact and each rejection carries the right reason.
{const fill=(seg,seconds=45)=>({seconds,segments:[seg,{hold:0,frames:seconds*30-seg.frames}]});
 assert.equal(validateTimeline(fill({hold:0,frames:30}),20).segments.length,2,'hold at 0 is inside the source');
 assert.throws(()=>validateTimeline(fill({hold:20,frames:30}),20),/Hold is outside/,'hold at exactly the duration has no frame');
 assert.throws(()=>validateTimeline(fill({hold:NaN,frames:30}),20),/Hold is outside/);
 assert.doesNotThrow(()=>validateTimeline(fill({start:19,end:20.03,frames:31}),20),'decoder tolerance at the end');
 assert.throws(()=>validateTimeline(fill({start:19,end:20.06,frames:32}),20),/Excerpt is outside/);
 assert.throws(()=>validateTimeline(fill({start:5,end:5,frames:1}),20),/Excerpt is outside/,'empty excerpt');
 assert.doesNotThrow(()=>validateTimeline(fill({start:0,end:1,frames:31}),20),'one frame of rounding slack');
 assert.throws(()=>validateTimeline(fill({start:0,end:1,frames:32}),20),/preserves narration speed/,'speed change rejected');
 for(const frames of [0,-30,1.5,'30',NaN])assert.throws(()=>validateTimeline({seconds:45,segments:[{hold:0,frames}]},20),/positive frame count/,String(frames));
 assert.throws(()=>validateTimeline({seconds:45,segments:[]},20),/45 or 120/);assert.throws(()=>validateTimeline({seconds:45,segments:'x'},20),/45 or 120/);
 assert.throws(()=>validateTimeline({seconds:'45',segments:[{hold:0,frames:1350}]},20),/45 or 120/,'seconds must be a number');
 assert.throws(()=>validateTimeline({seconds:45,segments:[{hold:0,frames:1349}]},20),/Expected 1350 frames, found 1349/);
 assert.equal(validateTimeline({seconds:120,segments:[{hold:0,frames:3600}]},20).seconds,120);}
console.log('PASS: validateTimeline boundaries and rejection reasons');

// planFromSentences: preference order, bad preferred indices, nothing fitting.
{const s=[{text:'A.',start:0,end:20},{text:'B.',start:30,end:50},{text:'C.',start:60,end:80}],excerpts=p=>p.segments.filter(x=>!('hold' in x)).map(x=>x.topic);
 assert.deepEqual(excerpts(planFromSentences(s,45)),['A.'],'only one 20 s sentence fits a 33 s budget');
 assert.deepEqual(excerpts(planFromSentences(s,45,[2])),['C.'],'preferred sentence wins');
 assert.deepEqual(excerpts(planFromSentences(s,45,[99,-1,NaN,2,2])),['C.'],'out-of-range and duplicate preferences are ignored');
 assert.deepEqual(excerpts(planFromSentences(s,120,[2,0])),['A.','B.','C.'],'excerpts play in source order whatever the preference order');
 assert.throws(()=>planFromSentences([{text:'Long.',start:0,end:40}],45),/No complete sentence fits/);
 assert.throws(()=>planFromSentences([],45),/No complete sentence fits/);
 assert.deepEqual(excerpts(planFromSentences([{text:'Zero.',start:3,end:3},{text:'Ok.',start:4,end:6}],45)),['Ok.'],'zero-length sentences are skipped');}
// Property: any transcript that passes validateWords yields a plan that passes validateTimeline for the same source.
for(let seed=1;seed<=300;seed++){
  const r=rng(seed),duration=20+r()*180,n=5+Math.floor(r()*120),words=[];let t=r()*2;
  for(let i=0;i<n&&t<duration;i++){const len=.05+r()*.8,end=Math.min(t+len,duration+r()*.1);words.push({text:`w${i}${r()<.15?'.':''}`,start:Math.min(t,end),end});t+=len+r()*.6;}
  if(r()<.5&&words.length)words.at(-1).end=duration+.1;
  const valid=validateWords(words,duration),sentences=sentencesOf(valid),seconds=r()<.5?45:120,preferred=Array.from({length:3},()=>Math.floor(r()*sentences.length*1.5)-1);
  let plan;try{plan=planFromSentences(sentences,seconds,preferred);}catch(e){assert.match(e.message,/No complete sentence fits/,`seed ${seed}`);continue;}
  assert.doesNotThrow(()=>validateTimeline(plan,duration),`seed ${seed}: generated plan must be exportable`);
  const ex=plan.segments.filter(x=>!('hold' in x));
  assert.ok('hold' in plan.segments[0]&&'hold' in plan.segments.at(-1),`seed ${seed}: opens and closes with voice-over holds`);
  for(let i=1;i<ex.length;i++)assert.ok(ex[i].start>=ex[i-1].start,`seed ${seed}: excerpts in source order`);
  assert.ok(ex.reduce((a,x)=>a+x.frames,0)<=(seconds-12)*30,`seed ${seed}: at least 12 s left for voice-over`);
}
console.log('PASS: planFromSentences preferences, failures, and 300 seeded transcripts always produce exportable plans');

// Laya custom endpoint: only HTTPS or loopback HTTP, exact request shape, strict answer validation.
{const real=globalThis.fetch,calls=[],answer=sel=>async(url,opts)=>{calls.push({url:String(url),opts});return new Response(JSON.stringify({answers:{selection:sel}}));};
 try{
  globalThis.fetch=answer({choice:'a',confidence:.9});
  for(const ok of ['https://laya.example.com','http://localhost:9000','http://127.0.0.1','http://[::1]:8080'])
    assert.equal((await layaChoice('s',{a:'one'},{enabled:true,endpoint:ok})).choice,'a',ok);
  for(const bad of ['http://localhost.evil.com','http://127.0.0.2','http://0.0.0.0','http://[::2]','ftp://example.com','javascript:alert(1)','file:///etc/passwd'])
    await assert.rejects(layaChoice('s',{a:'one'},{enabled:true,endpoint:bad}),/HTTPS or a loopback/,bad);
  await assert.rejects(layaChoice('s',{a:'one'},{enabled:true,endpoint:'not a url'}),TypeError);
  calls.length=0;const signal=new AbortController().signal;
  await layaChoice('state text',{a:'one',b:'two'},{enabled:true,endpoint:'https://laya.example.com/some/path/',signal});
  const {url,opts}=calls[0],body=JSON.parse(opts.body);
  assert.equal(url,'https://laya.example.com/v1/systemone');assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error','redirects must not leak text elsewhere');assert.equal(opts.signal,signal);
  assert.equal(body.state,'state text');assert.equal(body.min_confidence,.65);assert.deepEqual(body.questions.selection.criteria,{a:'one',b:'two'});
  globalThis.fetch=answer({choice:'a',confidence:.65});assert.equal((await layaChoice('s',{a:'one'},{enabled:true,endpoint:'https://x.example'})).needsReview,false,'.65 is enough');
  globalThis.fetch=answer({choice:'a',confidence:.6499});assert.equal((await layaChoice('s',{a:'one'},{enabled:true,endpoint:'https://x.example'})).needsReview,true);
  for(const sel of [{choice:'a',confidence:1.5},{choice:'a',confidence:-.1},{choice:'a',confidence:'0.9'},{choice:'a'},{choice:'__proto__',confidence:.9},{choice:'toString',confidence:.9},{choice:'constructor',confidence:.9},null]){
    globalThis.fetch=answer(sel);await assert.rejects(layaChoice('s',{a:'one'},{enabled:true,endpoint:'https://x.example'}),/Invalid Laya decision/,JSON.stringify(sel));}
  globalThis.fetch=async()=>new Response('{}');await assert.rejects(layaChoice('s',{a:'one'},{enabled:true,endpoint:'https://x.example'}),/Invalid Laya decision/,'no answers');
 }finally{globalThis.fetch=real;}}
// Laya hosted Space: Gradio queue + server-sent events, including events split across network chunks and CRLF framing.
{const real=globalThis.fetch,base='https://convaiinnovations-laya-demo.hf.space/gradio_api/call/run_playground';
 const complete=(sel,nl='\n')=>`event: complete${nl}data: ${JSON.stringify([null,JSON.stringify({answers:{selection:sel}})])}${nl}${nl}`;
 const hosted=({queue={event_id:'abc123'},queueStatus=200,chunks=[],resultStatus=200,open=false}={})=>{const seen={urls:[],cancelled:false};
   globalThis.fetch=async(url,opts)=>{seen.urls.push(String(url));if(String(url)===base){seen.body=JSON.parse(opts.body);return new Response(JSON.stringify(queue),{status:queueStatus});}
     const enc=new TextEncoder();let i=0;return new Response(new ReadableStream({pull(c){if(i<chunks.length)c.enqueue(enc.encode(chunks[i++]));else if(open)return new Promise(()=>{});else c.close();},cancel(){seen.cancelled=true;}}),{status:resultStatus});};return seen;};
 try{
  const msg=complete({choice:'b',confidence:.8});
  let seen=hosted({chunks:['event: generating\ndata: null\n\n',msg.slice(0,25),msg.slice(25,60),msg.slice(60)]});
  const d=await layaChoice('state',{a:'one',b:'two'},{enabled:true});
  assert.deepEqual([d.choice,d.confidence,d.needsReview],['b',.8,false]);assert.deepEqual(seen.urls,[base,`${base}/abc123`]);
  assert.equal(seen.body.data[0],'state');assert.deepEqual(JSON.parse(seen.body.data[1]).selection.criteria,{a:'one',b:'two'});
  hosted({chunks:[complete({choice:'a',confidence:.7},'\r\n')]});assert.equal((await layaChoice('s',{a:'one'},{enabled:true})).choice,'a','CRLF-framed events');
  seen=hosted({chunks:['event: error\ndata: null\n\n'],open:true});await assert.rejects(layaChoice('s',{a:'one'},{enabled:true}),/Hosted Laya inference failed/);assert.ok(seen.cancelled,'stream is released after an error');
  hosted({chunks:['event: heartbeat\ndata: null\n\n']});await assert.rejects(layaChoice('s',{a:'one'},{enabled:true}),/Invalid Laya decision/,'stream ends without a result');
  hosted({chunks:[complete({choice:'zzz',confidence:.99})]});await assert.rejects(layaChoice('s',{a:'one'},{enabled:true}),/Invalid Laya decision/,'hosted answers are validated too');
  for(const event_id of ['../../admin','ABC 1',undefined,'']){seen=hosted({queue:{event_id}});await assert.rejects(layaChoice('s',{a:'one'},{enabled:true}),/Invalid Laya queue identifier/,String(event_id));assert.equal(seen.urls.length,1,'no request built from an untrusted id');}
  hosted({queueStatus:500});await assert.rejects(layaChoice('s',{a:'one'},{enabled:true}),/Laya queue HTTP 500/);
  hosted({resultStatus:429});await assert.rejects(layaChoice('s',{a:'one'},{enabled:true}),/Laya result HTTP 429/);
 }finally{globalThis.fetch=real;}}
console.log('PASS: Laya endpoint allow-list, request shape, confidence range, hosted SSE parsing and failures');

// Status store: every audit status maps to the intended tone; aliases route log names to stage ids.
{const s=createStatus(),fired=[];const off=s.subscribe(()=>fired.push(1));
 const want={running:'running',passed:'passed','fallback passed':'passed',loaded:'passed',ready:'passed',imported:'fallback',fallback:'fallback',skipped:'fallback','needs review':'review',failed:'failed',unavailable:'failed',cancelled:'failed','needs attention':'failed','not needed':'idle','something new':'running'};
 for(const [status,tone] of Object.entries(want)){s.push({stage:'voz',status,detail:''});assert.equal(s.get('voz').tone,tone,status);}
 assert.equal(s.get('voz').history.length,Object.keys(want).length);
 for(const [name,id] of Object.entries({Laya:'laya','worked example':'source',example:'source',input:'source',transcript:'voz',timeline:'review',project:'export'})){s.push({stage:name,status:'failed',detail:name});assert.equal(s.get(id).detail,name,name);}
 const n=fired.length;s.reset();assert.equal(fired.length,n+1);assert.equal(s.get('voz').tone,'idle');assert.equal(s.get('voz').history.length,0);
 off();s.push({stage:'voz',status:'passed',detail:''});assert.equal(fired.length,n+1,'unsubscribed listener is not called');}
console.log('PASS: status tones, aliases, reset, unsubscribe');

// Router hash parsing.
{const {parse}=await import('../site/ui/router.js');
 for(const [hash,view,stage] of [['','',''],['#','',''],['#/','',''],['#/grid','grid',''],['#/graph/','graph',''],['#/graph/clips','graph','clips'],['#/graph/clips/extra','graph','clips'],['#graph','',''],['#/a b','a',''],['#/graph/<img>','graph','']])
   assert.deepEqual(parse(hash),{view,stage},hash);}
console.log('PASS: router parse');

// Graph shape: no two stages share a cell, every edge is drawn, failover edges are exactly Laya's.
{const {pos,layers,rows}=layout(),cells=new Set();
 for(const n of NODES){const p=pos.get(n.id);assert.ok(p,n.id);const k=`${p.layer}:${p.row}`;assert.ok(!cells.has(k),`overlap at ${k}`);cells.add(k);assert.ok(p.layer<layers&&p.row<rows);}
 assert.equal(edges().length,NODES.reduce((a,n)=>a+n.deps.length,0));
 assert.deepEqual(edges().filter(e=>e.failover).map(e=>`${e.from}>${e.to}`).sort(),['clips>laya','laya>review']);
 const custom=layout([{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:['a'],lane:0}]).pos;assert.deepEqual([custom.get('c').row,custom.get('b').row],[0,1],'free nodes avoid pinned lanes');
 assert.throws(()=>ancestors('nope'),/Unknown stage/);assert.throws(()=>descendants('nope'),/Unknown stage/);
 assert.equal(selection('export','upstream').size,NODES.length,'export depends on every stage');assert.equal(selection('source','downstream').size,NODES.length);
 assert.deepEqual(order([{id:'b',deps:[]},{id:'a',deps:[]}]).map(n=>n.id),['b','a'],'declaration order breaks ties');}
console.log('PASS: graph layout cells, edges, lanes, unknown stages');

// Engine: failures stop the run; skipped stages are not asked for inputs; unknown targets are named.
{const ran=[];
 await assert.rejects(runPipeline({voz:{run:()=>{throw Error('boom');}},ear:{run:()=>ran.push('ear')}},{}),/^Error: boom$/);assert.deepEqual(ran,[],'nothing runs after a failing stage');
 await runPipeline({laya:{when:()=>false,needs:()=>{throw Error('needs evaluated');},run:()=>{}}},{});
 await assert.rejects(runPipeline({},{},{target:'nope'}),/nope cannot be run on its own/);
 const ac=new AbortController(),after=[];await assert.rejects(runPipeline({voz:{run:()=>ac.abort()},ear:{run:()=>after.push('ear')}},{signal:ac.signal}),e=>e.name==='AbortError');assert.deepEqual(after,[],'abort inside a stage stops the next one');
 assert.deepEqual(await runPipeline({voz:{run:()=>{}}},{},{only:new Set(['voz','not-a-stage'])}),['voz'],'unknown ids in a selection are ignored');}
console.log('PASS: engine failure propagation, skip semantics, abort inside a stage');

// Align repair, seeded: kept words are exactly the model's, reverted words exactly the original, and nothing is reverted without a conflict.
{const o=[{text:'a',start:0,end:1}];
 assert.throws(()=>repairAlignment(o,null,5),/no words for 1/);
 assert.equal(repairAlignment(o,[null],5).kept,0);assert.equal(repairAlignment(o,[{start:0,end:5.11}],5).kept,0,'past the audio');assert.equal(repairAlignment(o,[{start:-1,end:1}],5).kept,0);
 for(let seed=1;seed<=500;seed++){
   const r=rng(seed),n=2+Math.floor(r()*40),orig=[];let t=0;for(let i=0;i<n;i++){const s=t+r()*.5;orig.push({text:'w'+i,start:s,end:s+.1+r()*.6});t=s+r()*.7;}
   const duration=orig.at(-1).end+1,aligned=orig.map(w=>r()<.1?{start:NaN,end:1}:{start:Math.max(0,w.start+(r()-.5)*(r()<.2?4:.2)),end:w.end+(r()-.5)*.2,refined:r()<.05?false:undefined});
   const out=repairAlignment(orig,aligned,duration);
   assert.equal(out.kept+out.reverted,n);assert.doesNotThrow(()=>validateWords(out.words,duration),`seed ${seed}`);
   out.words.forEach((w,i)=>{assert.equal(w.text,orig[i].text);const src=w.refined?aligned[i]:orig[i];assert.deepEqual([w.start,w.end],[src.start,src.end].map(Number),`seed ${seed} word ${i}`);});
   const ordered=orig.map((w,i)=>({start:w.start+.001,end:w.end}));assert.equal(repairAlignment(orig,ordered,duration).reverted,0,`seed ${seed}: no conflicts, no reverts`);
 }}
console.log('PASS: Align repair invariants over 500 seeded cases');
assert.deepEqual(move(['a','b','c'],2,-3),['c','a','b'],'negative target clamps to the front');assert.deepEqual(move(['a'],0,0),['a']);
console.log('PASS: reorder clamps');

// Demo projects: well-formed entries, faults only on model stages, and each fault does what its description says.
const {DEMOS,demo}=await import('../site/pipeline/demos.js'),{steps}=await import('../site/pipeline/steps.js'),{parse}=await import('../site/ui/router.js');
{assert.equal(new Set(DEMOS.map(d=>d.id)).size,DEMOS.length,'unique ids');assert.equal(DEMOS[0].id,'none');assert.equal(DEMOS[0].faults,undefined);assert.equal(DEMOS[0].example,undefined);
 for(const d of DEMOS){
   assert.ok(d.label&&d.detail,d.id);
   for(const id of Object.keys(d.faults??{}))assert.ok(steps[id]&&NODES.find(n=>n.id===id).kind==='model',`${d.id} faults ${id}, not a model stage`);
   if(d.id==='none')continue;
   assert.ok(['1b','2b'].includes(d.example),d.id);
   const {view,stage}=parse(d.route);assert.ok(['grid','graph'].includes(view)&&(!stage||NODES.some(n=>n.id===stage)),`${d.id} route ${d.route}`);
   assert.ok(['analyze','stage','upstream','downstream'].includes(d.record.run),d.id);if(d.record.run!=='analyze')assert.ok(steps[d.record.stage],`${d.id} records a runnable stage`);
 }
 assert.equal(demo('nope').id,'none','unknown demo falls back to real models');assert.equal(demo('clips-fail').force,true);
 const words=Array.from({length:30},(_,i)=>({text:'w'+i,start:i,end:i+.5})),payload={words,samples:new Float32Array(4),sampleRate:16000};
 for(const id of ['voz','ear','uhm','align','clips','clear'])assert.throws(()=>demo('offline').faults[id](payload),new RegExp(`^Error: Injected test fault: ${id}`));
 const bad=demo('malformed').faults;
 assert.throws(()=>validateWords(bad.voz(payload).words,10),/invalid text or timestamps/);
 assert.throws(()=>repairAlignment(words,bad.align(payload),40),/29 words for 30/);
 assert.ok(bad.clips(payload).some(x=>x.hi>=words.length)&&bad.clear(payload).sampleRate!==48000&&bad.ear(payload)===null&&bad.uhm(payload).fillers.some(f=>f.end<f.start));
 const crossed=repairAlignment(words,demo('align-crossing').faults.align(payload),40);
 assert.ok(crossed.reverted>0&&crossed.kept>crossed.reverted,JSON.stringify([crossed.kept,crossed.reverted]));assert.doesNotThrow(()=>validateWords(crossed.words,40));
 const ac=new AbortController(),hang=demo('hang').faults.voz(payload,ac.signal);let settled=false;hang.then(()=>{settled=true;},()=>{settled=true;});
 await new Promise(r=>setTimeout(r,20));assert.equal(settled,false,'hang never answers on its own');
 ac.abort();await assert.rejects(hang,e=>e.name==='AbortError');
 await assert.rejects(demo('hang').faults.voz(payload,AbortSignal.abort()),e=>e.name==='AbortError','already cancelled');}
console.log('PASS: demo definitions are well formed and each fault behaves as described');

// Demo recordings: every demo has one, it restores a valid project, and its audit is honest about how it was made.
{const fs=await import('node:fs'),{DEMO_TONES}=await import('./lib/demos.mjs');
 for(const d of DEMOS.filter(d=>d.record)){
   const f=new URL(`../site/demos/${d.id}.json`,import.meta.url);assert.ok(fs.existsSync(f),`missing recording site/demos/${d.id}.json — run node tools/record-demos.mjs ${d.id}`);
   const r=JSON.parse(fs.readFileSync(f,'utf8')),lines=r.audit.map(e=>`${e.stage}: ${e.status} — ${e.detail}`);
   assert.equal(r.demo,d.id);assert.equal(r.example,d.example);assert.ok(r.sourceSeconds>0&&!Number.isNaN(Date.parse(r.date)),d.id);assert.deepEqual(r.errors,[],`${d.id} recorded page errors`);
   assert.doesNotThrow(()=>validateWords(r.words,r.sourceSeconds),`${d.id} words`);assert.doesNotThrow(()=>validateTimeline(r.plan,r.sourceSeconds),`${d.id} plan`);
   for(const e of r.audit)assert.ok(typeof e.stage==='string'&&typeof e.status==='string'&&typeof e.detail==='string'&&!Number.isNaN(Date.parse(e.time)),`${d.id} audit entry ${JSON.stringify(e)}`);
   for(let i=1;i<r.audit.length;i++)assert.ok(r.audit[i].time>=r.audit[i-1].time,`${d.id} audit in time order`);
   assert.ok(lines.some(l=>l.startsWith(`demo: active — ${d.label}.`)),`${d.id} audit names its demo`);
   assert.ok(!lines.some(l=>/needs attention/.test(l)),`${d.id} run finished cleanly`);
   for(const id of Object.keys(d.faults??{}))assert.ok(!lines.includes(`${id}: passed — Real model inference completed`),`${d.id}: injected ${id} never claims real inference`);
   if(!d.faults&&!d.force)assert.ok(!lines.some(l=>/Injected/.test(l)),`${d.id}: real-model demo has no injected output`);
   if(d.force)assert.ok(lines.includes('clips: failed — Intentional failure demonstration requested')&&!lines.some(l=>l.startsWith('clips: running')),`${d.id}: Clips never ran`);
   const st=createStatus();for(const e of r.audit)st.push(e);
   for(const n of NODES){const want=n.id==='source'?'passed':DEMO_TONES[d.id][n.id]??'idle';assert.ok([want].flat().includes(st.get(n.id).tone),`${d.id}: ${n.id} is ${st.get(n.id).tone}, expected ${want}`);}
   if(d.record.export)assert.ok(r.export?.frames===r.plan.seconds*30,`${d.id} exported frame-exact`);
 }}
console.log('PASS: every demo recording restores a valid, honestly labelled project with the expected stage states');
