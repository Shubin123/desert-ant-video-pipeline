import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../site/',import.meta.url),out='/Users/admin/Downloads/improved-video-cuts-uxySSi';
const plans=JSON.parse(fs.readFileSync(`${out}/timeline.json`));
const media=[];
for(const id of ['1b','2b']){
 const transcript=JSON.parse(fs.readFileSync(`${out}/${id}-source.json`));
 const plan=plans.find(p=>p.id===id);
 const cleaned={seconds:plan.seconds,segments:plan.segments.map(s=>'hold'in s?{hold:s.hold,frames:s.frames,voiceover:s.voiceover}:{start:s.source_start_frame/30,end:s.source_end_frame/30,frames:s.frames,topic:s.topic})};
 fs.writeFileSync(new URL(`examples/${id}.json`,root),JSON.stringify({transcriptProvider:'MLX Whisper tiny, not Desert Ant Voz',words:transcript.segments.flatMap(s=>s.words.map(w=>({...w,text:w.word.trim()}))),plan:cleaned},null,2));
 const name=id==='1b'?'1b_improved_120s.mp4':'2b_improved_45s.mp4';
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',`${out}/${name}`]));
 const video=probe.streams.find(s=>s.codec_type==='video');
 if(Number(probe.format.duration)!==plan.seconds||Number(video.nb_read_frames)!==plan.seconds*30)throw Error('Export verification failed');
 media.push({id,file:name,seconds:Number(probe.format.duration),frames:Number(video.nb_read_frames),width:video.width,height:video.height,narrationSpeed:plan.narration_speed,voiceoverSlots:plan.segments.filter(s=>'hold'in s).length});
}
fs.writeFileSync(new URL('verification.json',root),JSON.stringify({date:new Date().toISOString(),individualModels:{browserInferencePassed:['tongue','emo','shapes','redact','gist','clear','ear','moderator','voz','uhm','align','clips','schemer','toxic'],localMacInferencePassed:['title'],accessChecksOnly:['eye','face','who'],titlePagesLimit:'Headless Chrome Local Network Access blocks Pages to loopback. Local Title inference passed.',betaChecks:'Schemer extracted all four fields and rejected malformed schema; Toxic flagged synthetic threat with 98.3% THREAT confidence.'},layaLiveTest:{provider:'Official convaiinnovations/laya-demo Space',choice:'database',confidence:.7847,actualInference:true},workedMedia:media,note:'Worked edits are curated, example transcripts are MLX Whisper tiny. Browser end-to-end checks are recorded separately.'},null,2));
console.log(JSON.stringify(media));
