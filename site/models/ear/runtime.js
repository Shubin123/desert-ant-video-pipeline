export async function load(onProgress) {
  const { Ear } = await import('@desert-ant-labs/ear');
  const litert = await import('@litertjs/core');
  return Ear.load({ litert, litertWasmDir: 'https://unpkg.com/@litertjs/core@2.5.2/wasm/', onProgress });
}


