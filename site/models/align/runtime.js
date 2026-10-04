export async function load(onProgress) {
  const litert = await import('@litertjs/core');
  const {calibrator,refine}=await import('./engine.js');
  await litert.loadLiteRt('https://unpkg.com/@litertjs/core@2.5.2/wasm/');
  const base='https://huggingface.co/desert-ant-labs/align/resolve/v1.1.0/';
  let completed=0;const get=async name=>{const response=await fetch(base+name);if(!response.ok)throw Error(`Download failed: ${name}`);const data=await response.arrayBuffer();onProgress(++completed/5);return data;};
  const cfg=JSON.parse(new TextDecoder().decode(await get('refiner_config.json'))),filters=new Float32Array(await get('mel_filters.bin')),correct=calibrator(await get('calibrator.bin')),coarse=await litert.loadAndCompile(new Uint8Array(await get('align-coarse.tflite')),{accelerator:'wasm'}),fine=await litert.loadAndCompile(new Uint8Array(await get('align-fine.tflite')),{accelerator:'wasm'});
  return {refine:(samples,rate,words,language)=>refine({litert,coarse,fine,cfg,filters,correct},samples,rate,words,language)};
}

