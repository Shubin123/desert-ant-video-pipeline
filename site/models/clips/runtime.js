export async function load(onProgress) {
  const litert = await import('@litertjs/core');
  const {tokenizer,clips}=await import('./engine.js');
  const {browserIndices}=await import('./compat.js');
  await litert.loadLiteRt('https://unpkg.com/@litertjs/core@2.5.2/wasm/');
  const base='https://huggingface.co/desert-ant-labs/clips/resolve/v0.1.0/';let done=0;
  const get=async name=>{const response=await fetch(base+name);if(!response.ok)throw Error(`Download failed: ${name}`);const data=await response.arrayBuffer();onProgress(++done/4);return data;};
  const meta=JSON.parse(new TextDecoder().decode(await get('clips_meta.json'))),encode=tokenizer(await get('clip_tokenizer.bin'));
  const selectorBytes=browserIndices(new Uint8Array(await get('clips-selector.tflite')));
  const scorerBytes=browserIndices(new Uint8Array(await get('clips-scorer.tflite')));
  return {clips:async(sentences,onProgress)=>{
    let selector,scorer;
    try{
      selector=await litert.loadAndCompile(selectorBytes,{accelerator:'wasm'});
      return await clips({litert,selector,meta,encode,loadScorer:async()=>{
        // These encoders cannot coexist within WebAssembly's memory limit.
        selector.delete();selector=null;
        scorer=await litert.loadAndCompile(scorerBytes,{accelerator:'wasm'});
        return scorer;
      }},sentences,onProgress);
    }finally{selector?.delete();scorer?.delete();}
  }};
}

