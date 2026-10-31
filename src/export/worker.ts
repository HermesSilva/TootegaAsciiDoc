// worker_threads entry: hosts the WebAssembly converter (wasmConverter.ts) so the extension host never blocks.
import { parentPort, workerData } from 'node:worker_threads';
import type { ConversionRequest } from './abi';
import { WasmConverter } from './wasmConverter';

interface WorkerData {
  wasmPath: string;
}

const data = workerData as WorkerData;
const converter = new WasmConverter({
  wasmDir: data.wasmPath,
  log: (message) => parentPort?.postMessage({ type: 'log', message }),
});
void converter.load();

parentPort?.on('message', async (request: ConversionRequest) => {
  const response = await converter.convert(request);
  const transfer = response.output ? [response.output.buffer as ArrayBuffer] : [];
  parentPort?.postMessage(response, transfer);
});
