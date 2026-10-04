// Official Laya is a bounded text-decision model, not a media generator.
export async function layaChoice(state, criteria, {enabled=false, endpoint='', signal}={}) {
  if(!enabled) throw Error('Laya requires consent to send text to its configured server.');
  const questions={selection:{type:'choice',instructions:'Choose the most informative, self-contained educational excerpt. Do not invent content.',criteria}};
  let answers;
  if(endpoint) {
    const url=new URL(endpoint);
    if(url.protocol!=='https:' && !(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.protocol==='http:')) throw Error('Use HTTPS or a loopback Laya endpoint.');
    const r=await fetch(new URL('/v1/systemone',url),{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({state,questions,lang:'en',min_confidence:.65})});
    if(!r.ok) throw Error(`Laya HTTP ${r.status}`);
    answers=(await r.json()).answers;
  } else {
    const base='https://convaiinnovations-laya-demo.hf.space/gradio_api/call/run_playground';
    const r=await fetch(base,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({data:[String(state),JSON.stringify(questions)]})});
    if(!r.ok) throw Error(`Laya queue HTTP ${r.status}`);
    const {event_id}=await r.json();
    if(!/^[a-f0-9]+$/.test(event_id)) throw Error('Invalid Laya queue identifier');
    const response=await fetch(`${base}/${event_id}`,{signal});
    if(!response.ok) throw Error(`Laya result HTTP ${response.status}`);
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    try {while(true){const {value,done}=await reader.read();if(done) break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop();for(const block of blocks){if(block.includes('event: error'))throw Error('Hosted Laya inference failed');if(block.includes('event: complete')){const line=block.split('\n').find(x=>x.startsWith('data: '));const outputs=JSON.parse(line.slice(6));answers=JSON.parse(outputs[1]).answers;break;}}if(answers)break;}}finally{await reader.cancel();}
  }
  const answer=answers?.selection;
  if(!answer || !Object.hasOwn(criteria,answer.choice) || !Number.isFinite(answer.confidence) || answer.confidence<0 || answer.confidence>1) throw Error('Invalid Laya decision');
  return {provider:'Laya',choice:answer.choice,confidence:answer.confidence,needsReview:answer.confidence<.65};
}

export function validateTimeline(plan,duration) {
  if(![45,120].includes(plan.seconds)||!Array.isArray(plan.segments)||!plan.segments.length)throw Error('Timeline must target 45 or 120 seconds.');
  let frames=0;
  for(const s of plan.segments){
    if(!Number.isInteger(s.frames)||s.frames<=0)throw Error('Each segment needs a positive frame count.');
    if('hold' in s){if(!Number.isFinite(s.hold)||s.hold<0||s.hold>=duration)throw Error('Hold is outside the source.');}
    else {if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start||s.end>duration+.04)throw Error('Excerpt is outside the source.');if(Math.abs((s.end-s.start)*30-s.frames)>1)throw Error('This exporter preserves narration speed: frames must match excerpt duration.');}
    frames+=s.frames;
  }
  if(frames!==plan.seconds*30)throw Error(`Expected ${plan.seconds*30} frames, found ${frames}.`);
  return plan;
}

export function planFromSentences(sentences,seconds,preferred=[]) {
  const budget=Math.floor((seconds-12)*30), selected=[], used=new Set();let frames=0;
  const order=[...preferred,...sentences.map((_,i)=>i)];
  for(const i of order){if(used.has(i))continue;used.add(i);const s=sentences[i];if(!s)continue;const start=Math.round(s.start*30)/30,end=Math.round(s.end*30)/30,n=Math.round((end-start)*30);if(n>0&&frames+n<=budget){selected.push({start,end,frames:n,topic:s.text});frames+=n;}}
  if(!selected.length)throw Error('No complete sentence fits. Import or edit a timeline.');
  selected.sort((a,b)=>a.start-b.start);
  const remaining=seconds*30-frames,first=Math.floor(remaining/2);
  return {seconds,segments:[{hold:selected[0].start,frames:first,voiceover:'Opening explanation'},...selected,{hold:Math.max(0,selected.at(-1).end-1/30),frames:remaining-first,voiceover:'Closing explanation'}]};
}
