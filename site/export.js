import {validateTimeline} from './failover.js';
const CDN='https://unpkg.com/mediabunny@1.59.0/dist/bundles/mediabunny.mjs';
export async function exportVideo(file,audio,plan,voices,onProgress,signal) {
  validateTimeline(plan,audio.duration);
  const M=await import(CDN),input=new M.Input({source:new M.BlobSource(file),formats:M.ALL_FORMATS});
  let output;
  try {
    const track=await input.getPrimaryVideoTrack();
    if(!track)throw Error('No video track. Download the timeline for an external editor.');
    const width=await track.getDisplayWidth(),height=await track.getDisplayHeight();
    if(!await M.canEncodeVideo('avc',{width,height,frameRate:30})||!await M.canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:1}))throw Error('H.264/AAC export is unavailable in this browser. Download timeline + audit and use the local renderer.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),sink=new M.CanvasSink(track,{poolSize:2}),target=new M.BufferTarget();
    output=new M.Output({format:new M.Mp4OutputFormat(),target});
    const video=new M.CanvasSource(canvas,{codec:'avc',bitrate:2_000_000}),sound=new M.AudioBufferSource({codec:'aac',bitrate:192000});
    output.addVideoTrack(video,{frameRate:30});output.addAudioTrack(sound);
    const mixed=new AudioBuffer({numberOfChannels:1,length:plan.seconds*48000,sampleRate:48000}),dst=mixed.getChannelData(0),src=audio.getChannelData(0);
    let cursor=0;
    for(let index=0;index<plan.segments.length;index++){
      const s=plan.segments[index],n=s.frames*1600;
      if('hold' in s){const voice=voices.get(index);if(voice){if(voice.duration>s.frames/30+.01)throw Error(`Voice-over exceeds slot ${index+1}.`);dst.set(voice.getChannelData(0).subarray(0,n),cursor);}}
      else {const start=Math.round(s.start*48000);dst.set(src.subarray(start,start+n),cursor);const fade=Math.min(1200,n/2);for(let k=0;k<fade;k++){dst[cursor+k]*=k/fade;dst[cursor+n-1-k]*=k/fade;}}
      cursor+=n;
    }
    await output.start();
    const audioPromise=sound.add(mixed);let frame=0;
    for(const s of plan.segments){
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      if('hold' in s){const image=await sink.getCanvas(s.hold);if(!image)throw Error('Cannot decode held frame.');ctx.drawImage(image.canvas,0,0,width,height);for(let k=0;k<s.frames;k++){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');await video.add(frame++/30,1/30);if(k%30===0)onProgress(frame/(plan.seconds*30));}}
      else {const times=Array.from({length:s.frames},(_,k)=>s.start+k/30);let count=0;for await(const image of sink.canvasesAtTimestamps(times)){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(!image)throw Error('Cannot decode excerpt frame.');ctx.drawImage(image.canvas,0,0,width,height);await video.add(frame++/30,1/30);if(++count%30===0)onProgress(frame/(plan.seconds*30));}if(count!==s.frames)throw Error('Decoder produced an incomplete excerpt.');}
    }
    await audioPromise;await output.finalize();
    // AAC encoders append whole packets. Remux with an exact final packet
    // duration so container/audio duration cannot exceed the reviewed timeline.
    const encoded=new M.Input({source:new M.BufferSource(target.buffer),formats:M.ALL_FORMATS}),finalTarget=new M.BufferTarget();
    const trimmed=new M.Output({format:new M.Mp4OutputFormat(),target:finalTarget});
    try {
      const vt=await encoded.getPrimaryVideoTrack(),at=await encoded.getPrimaryAudioTrack();
      const vs=new M.EncodedVideoPacketSource('avc'),as=new M.EncodedAudioPacketSource('aac');
      trimmed.addVideoTrack(vs,{frameRate:30});trimmed.addAudioTrack(as);await trimmed.start();
      async function copy(track,source){const config=await track.getDecoderConfig();for await(const packet of new M.EncodedPacketSink(track).packets()){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(packet.timestamp>=plan.seconds)continue;const duration=Math.min(packet.duration,plan.seconds-packet.timestamp);await source.add(packet.clone({duration}),{decoderConfig:config});}}
      await Promise.all([copy(vt,vs),copy(at,as)]);await trimmed.finalize();
    } catch(error){await trimmed.cancel().catch(()=>{});throw error;}
    finally {encoded.dispose();}
    onProgress(1);
    return {blob:new Blob([finalTarget.buffer],{type:'video/mp4'}),width,height,frames:frame,seconds:plan.seconds,voiceovers:voices.size};
  } catch(error){await output?.cancel?.().catch(()=>{});throw error;}
  finally {input.dispose();}
}
