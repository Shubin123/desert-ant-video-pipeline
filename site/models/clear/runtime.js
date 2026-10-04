export async function load(onProgress) {
  const { Clear } = await import('@desert-ant-labs/clear');
  const litert = await import('@litertjs/core');
  return Clear.load({ litert, litertWasmDir: 'https://unpkg.com/@litertjs/core@2.5.2/wasm/', onProgress });
}


