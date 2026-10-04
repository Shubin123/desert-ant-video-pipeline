export async function load(onProgress) {
  const { Voz } = await import('@desert-ant-labs/voz');
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.numThreads = 1;
  return Voz.load({ ort, wasmDir: 'https://unpkg.com/onnxruntime-web@1.30.0/dist/', onProgress });
}


