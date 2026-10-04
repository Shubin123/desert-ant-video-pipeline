import {planFromSentences} from '../failover.js';
import {repairAlignment} from './words.js';

// Each step reads and writes ctx.S (shared pipeline state) and reports through ctx.log.
const rethrow=error=>{if(error.name==='AbortError')throw error;};

export const steps={
  voz:{needs:c=>!c.S.file&&'a source video (choose one in panel 1)',async run(c){
    const {S}=c,original=S.words;
    const asr=await c.attempt('voz',{file:S.file},async()=>{if(!original.length)throw Error('Voz failed. Import a timestamped transcript; Laya cannot invent missing speech.');c.log('voz','fallback','Using imported timestamped transcript; review accuracy');return {words:original};});
    c.setWords(asr.words);S.results.transcriptionProvider=asr.words===original?'Imported transcript':'Desert Ant Voz';c.showResults();
  }},
  ear:{needs:c=>!c.S.file&&'a source video (choose one in panel 1)',async run(c){
    c.S.results.ear=await c.attempt('ear',await c.speech(),async()=>{c.log('ear','fallback','Language unspecified; alignment defaults to English and needs review');return {language:'en',unverified:true};});
  }},
  uhm:{needs:c=>!c.S.file&&'a source video (choose one in panel 1)',async run(c){
    c.S.results.uhm=await c.attempt('uhm',await c.speech(),async()=>{c.log('uhm','skipped','No filler detection; retaining all source speech');return {fillers:[],unverified:true};});
  }},
  align:{needs:c=>(!c.S.file&&'a source video')||(!c.S.words.length&&'timestamped words. Run Voz or import a transcript first'),async run(c){
    const {S}=c,aligned=await c.attempt('align',{...await c.speech(),words:S.words,language:'en'},async()=>{c.log('align','fallback','Keeping original word timestamps, without refinement');return S.words;});
    if(aligned===S.words)return;
    const fixed=repairAlignment(S.words,aligned,S.audio.duration);
    c.setWords(fixed.words);S.results.align={refined:fixed.kept,reverted:fixed.reverted};
    if(fixed.reverted)c.log('align','passed',`${fixed.kept} of ${fixed.words.length} words refined; ${fixed.reverted} kept their original timing to stay in order`);
  }},
  clips:{needs:c=>!c.S.sentences.length&&'a transcript. Run Voz or Align first',async run(c){
    const {S}=c;S.preferred=[];S.clipsFailed=false;
    if(c.force()){c.log('clips','failed','Intentional failure demonstration requested');S.clipsFailed=true;return;}
    try{const value=await c.attempt('clips',{sentences:S.sentences.map(x=>x.text)},async error=>{throw error;});S.results.clips=value;S.preferred=value.flatMap(s=>Array.from({length:s.hi-s.lo+1},(_,i)=>s.lo+i));}
    catch(error){rethrow(error);S.clipsFailed=true;}
  }},
  laya:{needs:c=>!c.S.sentences.length&&'a transcript. Run Voz or Align first',when:c=>c.S.clipsFailed,async run(c){
    const {S}=c;
    try{const d=await c.decision();S.results.laya=d.value;S.preferred=[d.index];}
    catch(error){rethrow(error);c.log('Laya','unavailable',error.message);c.log('clips','fallback','Deterministic complete-sentence proposal; human review required');}
  }},
  clear:{needs:c=>!c.S.audio&&'a source video (choose one in panel 1)',async run(c){
    const {S}=c;
    S.results.clear=await c.attempt('clear',{samples:S.audio.getChannelData(0).slice(),sampleRate:48000},async()=>{c.log('clear','fallback','Original audio retained, not enhanced');return null;});
    if(S.results.clear){const enhanced=new AudioBuffer({numberOfChannels:1,length:S.audio.length,sampleRate:48000}),data=S.results.clear.samples;if(S.results.clear.sampleRate!==48000||!data?.length)throw Error('Invalid enhanced audio output');enhanced.copyToChannel(data.subarray(0,enhanced.length),0);S.audio=enhanced;S.results.clear={sampleRate:48000,duration:enhanced.duration,enhanced:true};}
  }},
  review:{needs:c=>!c.S.sentences.length&&'a transcript. Run Voz or Align first',async run(c){
    const {S}=c;
    c.setPlan(planFromSentences(S.sentences,c.length(),S.preferred));c.showResults();
    c.log('review','ready','Review excerpt boundaries and voice-over holds before export. Filler detection is advisory; no speech was automatically deleted.');
  }},
  export:{needs:c=>!c.hasTimeline()&&'a timeline. Run Timeline or load a worked example first',async run(c){await c.exportVideo();}},
};
