// Main-thread side of the export: owns the worker that hosts the WebAssembly converter, serialises requests and
// turns the worker's answers into results or explicit errors.
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { dlog, log, logError } from '../util/logger';
import type { ConversionRequest, ConversionResponse } from './abi';

const IDLE_MS = 60_000;
const TIMEOUT_MS = 180_000;

interface Pending {
  resolve: (r: ConversionResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Converter {
  private worker: Worker | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly distPath: string) {}

  async convert(request: Omit<ConversionRequest, 'id'>): Promise<ConversionResponse> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    return new Promise<ConversionResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.terminate();
        reject(new Error(`the conversion did not finish within ${TIMEOUT_MS / 1000} s; the converter was stopped`));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      // Plain data only: VS Code configuration values are proxies that `postMessage` cannot clone ("#<Object> could
      // not be cloned", seen on 2026-10-31), so the request is rebuilt through JSON before crossing to the worker.
      worker.postMessage(JSON.parse(JSON.stringify({ ...request, id } satisfies ConversionRequest)) as ConversionRequest);
    });
  }

  dispose(): void {
    this.terminate();
  }

  private ensureWorker(): Worker {
    this.touch();
    if (this.worker) return this.worker;
    const script = path.join(this.distPath, 'export-worker.js');
    dlog('export', `starting worker ${script}`);
    const worker = new Worker(script, { workerData: { wasmPath: this.distPath } });
    worker.on('message', (message: ConversionResponse | { type: 'log'; message: string }) => {
      if ('type' in message && message.type === 'log') {
        log(`[converter] ${message.message}`);
        return;
      }
      const response = message as ConversionResponse;
      const p = this.pending.get(response.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(response.id);
      p.resolve(response);
      this.touch();
    });
    worker.on('error', (e: Error) => {
      logError('export-worker', e);
      this.failAll(new Error(`the converter worker crashed: ${e.message}`));
      this.worker = null;
    });
    worker.on('exit', (code) => {
      if (code !== 0) this.failAll(new Error(`the converter worker exited with code ${code}`));
      if (this.worker === worker) this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.terminate();
    }, IDLE_MS);
  }

  private terminate(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const w = this.worker;
    this.worker = null;
    if (w) {
      dlog('export', 'stopping worker');
      void w.terminate();
    }
  }

  private failAll(error: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(error);
      this.pending.delete(id);
    }
  }
}
