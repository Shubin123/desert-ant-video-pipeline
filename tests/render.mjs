// Local FFmpeg fallback (tools/render.py): renders a planner-built project frame-exact, keeps holds silent,
// refuses to overwrite, and rejects every invalid plan the browser exporter rejects. Needs python3 + FFmpeg.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {planFromSentences,validateTimeline} from '../site/failover.js';
import {check,finish,out} from './lib/harness.mjs';

const results=[],dir=fs.mkdtempSync(path.join(out,'render-')),src=path.join(dir,'source.mp4'),renderer=path.resolve('tools/render.py');
const render=(plan,target)=>{const project=path.join(dir,`p-${Math.random().toString(36).slice(2)}.json`);fs.writeFileSync(project,JSON.stringify({plan}));return spawnSync('python3',[renderer,project,src,target],{encoding:'utf8'});};
try{
  // 60 s synthetic source: a moving test pattern with a continuous 440 Hz tone, so excerpts are loud and holds must be silent.
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=30:duration=60','-f','lavfi','-i','sine=frequency=440:duration=60:sample_rate=48000','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',src]);
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',src]));
  const plan=planFromSentences([{text:'One.',start:2,end:9.5},{text:'Two.',start:14,end:27},{text:'Three.',start:40,end:52}],45);
  validateTimeline(plan,duration);

  const target=path.join(dir,'out.mp4'),r=render(plan,target);
  check(results,'renders a valid planner timeline',r.status===0&&fs.existsSync(target),r.stderr.trim());
  const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',target]));
  const v=meta.streams.find(s=>s.codec_type==='video'),a=meta.streams.find(s=>s.codec_type==='audio');
  check(results,'exactly 1350 frames',Number(v?.nb_read_frames)===1350,v?.nb_read_frames);
  check(results,'45 s container',Math.abs(Number(meta.format.duration)-45)<.05,meta.format.duration);
  check(results,'H.264 + mono 48 kHz AAC',v?.codec_name==='h264'&&a?.codec_name==='aac'&&a?.channels===1&&Number(a?.sample_rate)===48000,`${v?.codec_name} ${a?.codec_name} ${a?.channels}ch ${a?.sample_rate}`);
  // Hold audio is silence; excerpt audio is the source tone (skip the 25 ms fades at each edge).
  const pcm=execFileSync('ffmpeg',['-v','error','-i',target,'-ac','1','-ar','48000','-f','f32le','pipe:1'],{maxBuffer:64<<20}),samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.byteLength/4);
  const peak=(from,to)=>{let p=0;for(let i=Math.round(from*48000);i<Math.round(to*48000);i++)p=Math.max(p,Math.abs(samples[i]??0));return p;};
  const hold=plan.segments[0].frames/30,first=plan.segments[1].frames/30;
  check(results,'opening voice-over hold is silent',peak(.05,hold-.05)<1e-3,peak(.05,hold-.05));
  check(results,'first excerpt carries source audio',peak(hold+.1,hold+first-.1)>.05,peak(hold+.1,hold+first-.1));
  const closing=plan.segments.at(-1).frames/30;check(results,'closing voice-over hold is silent',peak(45-closing+.05,44.95)<1e-3);

  const before=fs.statSync(target).mtimeMs,again=render(plan,target);
  check(results,'refuses to overwrite an existing output',again.status!==0&&/refusing overwrite/.test(again.stderr)&&fs.statSync(target).mtimeMs===before,again.stderr.trim().split('\n').at(-1));
  const usage=spawnSync('python3',[renderer,'only-one-arg'],{encoding:'utf8'});
  check(results,'usage error with wrong arguments',usage.status!==0&&/Usage/.test(usage.stderr));

  // Parity with the browser exporter: every plan validateTimeline rejects, render.py rejects before encoding anything.
  const edit=(i,patch)=>({...plan,segments:plan.segments.map((s,k)=>k===i?{...s,...patch}:s)});
  const ex=plan.segments.findIndex(s=>!('hold' in s));
  for(const [name,bad,reason] of [
    ['unsupported length',{...plan,seconds:60},/Unsupported target/],
    ['one frame short',edit(0,{frames:plan.segments[0].frames-1}),/Invalid frame total/],
    ['hold at the end of the source',edit(0,{hold:duration}),/Invalid hold/],
    ['negative hold',edit(0,{hold:-1}),/Invalid hold/],
    ['excerpt past the source',edit(ex,{start:plan.segments[ex].start+duration,end:plan.segments[ex].end+duration}),/Invalid excerpt/],
    ['speed change',edit(ex,{end:plan.segments[ex].end+2}),/Invalid excerpt/],
    ['zero-frame segment',{...plan,segments:[{hold:0,frames:0},...plan.segments]},/Invalid frame count/],
  ]){
    let jsRejects=false;try{validateTimeline(bad,duration);}catch{jsRejects=true;}
    const t=path.join(dir,`bad-${name.replace(/\W+/g,'-')}.mp4`),r=render(bad,t);
    check(results,`rejects ${name} (browser exporter agrees)`,jsRejects&&r.status!==0&&reason.test(r.stderr)&&!fs.existsSync(t),r.stderr.trim().split('\n').at(-1));
  }
}catch(e){check(results,'render run',false,e.stack);}
finally{fs.rmSync(dir,{recursive:true,force:true});}
finish(results,'render');
