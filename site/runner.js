// Each stage has its own realm so large LiteRT/ONNX heaps do not accumulate.
const id = new URL(location.href).searchParams.get('model');
const nonce = new URL(location.href).searchParams.get('nonce');
const send = data => parent.postMessage({nonce,...data}, location.origin);
addEventListener('message', async event => {
  if(event.source !== parent || event.origin !== location.origin || event.data?.nonce !== nonce) return;
  let model;
  try {
    const {load} = await import(`./models/${id}/runtime.js`);
    model = await load(progress=>send({progress}));
    const p=event.data.payload;
    let result;
    if(id==='voz') result=await model.transcribe(p.file,{onProgress:progress=>send({progress})});
    else if(id==='clear') result=await model.enhance(p.samples,p.sampleRate);
    else if(id==='ear') result=await model.identify(p.samples,p.sampleRate);
    else if(id==='uhm') result=await model.analyze(p.samples,p.sampleRate,progress=>send({progress}));
    else if(id==='align') result=await model.refine(p.samples,p.sampleRate,p.words,p.language||'en');
    else if(id==='clips') result=await model.clips(p.sentences,progress=>send({progress}));
    else throw Error('Unsupported stage');
    send({result});
  } catch(error) {send({error:String(error.message||error)});}
  finally {await model?.dispose?.(); await model?.flushTelemetry?.();}
});
send({ready:true});
