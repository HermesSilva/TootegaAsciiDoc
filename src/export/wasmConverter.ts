// The AsciiDocConverter WebAssembly module, loaded and driven from Node — pure (no VS Code API), so the export
// worker uses it and the unit tests exercise it directly. The resolver import reads includes, images and stylesheets
// from disk, relative to the file that holds the directive (so nested includes work), and refuses anything outside
// the allowed folders unless the request allows it.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ResourceType, RESULT_NAMES, WASM_FILE, type ConversionRequest, type ConversionResponse, type ConverterMessage, type WasmExports } from './abi';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

const WASI_ESUCCESS = 0;
const WASI_EBADF = 8;
const WASI_ENOSYS = 52;

export interface WasmConverterOptions {
  /** Folder holding AsciiDocConverter.wasm. */
  wasmDir: string;
  /** Receives diagnostic lines (C-side stdout/stderr, resolver failures). Never silent. */
  log?: (message: string) => void;
}

interface Current {
  request: ConversionRequest;
  denied: string[];
  allocated: number[];
}

export class WasmConverter {
  private instance: WebAssembly.Instance | null = null;
  private ex: WasmExports | null = null;
  private loadError: string | null = null;
  private loading: Promise<void> | null = null;
  private current: Current | null = null;

  constructor(private readonly options: WasmConverterOptions) {}

  /** Loads (once) the module; a failure is remembered and reported by `convert`. */
  load(): Promise<void> {
    if (!this.loading) this.loading = this.doLoad();
    return this.loading;
  }

  get error(): string | null {
    return this.loadError;
  }

  async convert(request: ConversionRequest): Promise<ConversionResponse> {
    await this.load();
    if (!this.ex) return { id: request.id, ok: false, rc: -1, messages: [], denied: [], error: this.loadError ?? 'module not loaded' };
    return this.run(request);
  }

  // ------------------------------------------------------------------------------------------------ loading

  private async doLoad(): Promise<void> {
    const file = path.join(this.options.wasmDir, WASM_FILE);
    if (!fs.existsSync(file)) {
      this.loadError = `The AsciiDocConverter WebAssembly module was not found at ${file}.`;
      return;
    }
    try {
      const bytes = fs.readFileSync(file);
      const module = await WebAssembly.compile(bytes);
      const imports: WebAssembly.Imports = {
        env: { adc_wasm_resolver: (t: number, p: number, pl: number, o: number, ol: number) => this.resolverImport(t, p, pl, o, ol) },
        wasi_snapshot_preview1: this.wasiImports(module),
      };
      const missing = WebAssembly.Module.imports(module).filter((i) => (imports[i.module] as Record<string, unknown> | undefined)?.[i.name] === undefined);
      if (missing.length > 0) throw new Error(`the module imports ${missing.map((i) => `${i.module}.${i.name}`).join(', ')}, which the extension does not provide`);
      this.instance = await WebAssembly.instantiate(module, imports);
      const ex = this.instance.exports as unknown as WasmExports;
      for (const name of ['memory', 'adc_wasm_alloc', 'adc_wasm_free', 'adc_wasm_converter', 'adc_wasm_saida', 'adc_wasm_saida_tamanho', 'adc_wasm_mensagens', 'adc_wasm_limpar', 'adc_wasm_versao', 'adc_wasm_resolvido'])
        if (!(name in (this.instance.exports as object))) throw new Error(`the module does not export ${name}`);
      this.ex = ex;
      ex._initialize?.();
      this.loadError = null;
    } catch (e) {
      this.instance = null;
      this.ex = null;
      this.loadError = `The AsciiDocConverter WebAssembly module at ${file} could not be loaded: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ------------------------------------------------------------------------------------------------ memory

  private mem(): Uint8Array {
    return new Uint8Array((this.ex as WasmExports).memory.buffer);
  }

  private readBytes(ptr: number, length: number): Uint8Array {
    return this.mem().slice(ptr, ptr + length);
  }

  private readCString(ptr: number): string {
    if (ptr === 0) return '';
    const m = this.mem();
    let end = ptr;
    while (end < m.length && m[end] !== 0) end++;
    return decoder.decode(m.subarray(ptr, end));
  }

  private writeBytes(bytes: Uint8Array): number {
    const ex = this.ex as WasmExports;
    const ptr = ex.adc_wasm_alloc(bytes.length + 1);
    if (ptr === 0) throw new Error('adc_wasm_alloc returned 0 (out of memory inside the module)');
    this.mem().set(bytes, ptr);
    this.mem()[ptr + bytes.length] = 0;
    return ptr;
  }

  // ------------------------------------------------------------------------------------------------ resolver

  private resolveResource(type: number, target: string, origin: string): { content: Uint8Array; resolved: string } | { denied: string } | null {
    if (!this.current) return null;
    const { request } = this.current;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return null; // URIs are not read (no network from the converter)
    const documentDir = path.dirname(request.documentPath);
    const originDir = origin ? path.dirname(origin) : documentDir;
    const candidates: string[] = [];
    if (path.isAbsolute(target)) candidates.push(target);
    else {
      if (type === ResourceType.Image && request.imagesDir) candidates.push(path.resolve(request.imagesDir, target));
      candidates.push(path.resolve(originDir, target));
      if (origin) candidates.push(path.resolve(documentDir, target));
    }
    for (const candidate of candidates) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const allowed = request.allowOutsideWorkspace || isInside(candidate, documentDir) || request.workspaceFolders.some((f) => isInside(candidate, f));
      if (!allowed) return { denied: candidate };
      return { content: fs.readFileSync(candidate), resolved: candidate };
    }
    return null;
  }

  private resolverImport(type: number, targetPtr: number, targetLen: number, originPtr: number, originLen: number): number {
    try {
      const target = decoder.decode(this.readBytes(targetPtr, targetLen));
      const origin = originLen > 0 ? decoder.decode(this.readBytes(originPtr, originLen)) : '';
      const result = this.resolveResource(type, target, origin);
      if (!result) return 1;
      if ('denied' in result) {
        this.current?.denied.push(result.denied);
        return 2;
      }
      const ex = this.ex as WasmExports;
      const contentPtr = this.writeBytes(result.content);
      const pathBytes = encoder.encode(result.resolved);
      const pathPtr = this.writeBytes(pathBytes);
      this.current?.allocated.push(contentPtr, pathPtr);
      ex.adc_wasm_resolvido(contentPtr, result.content.length, pathPtr, pathBytes.length);
      return 0;
    } catch (e) {
      this.options.log?.(`resolver failed: ${e instanceof Error ? e.message : String(e)}`);
      return 3;
    }
  }

  // ------------------------------------------------------------------------------------------------ WASI

  private wasiImports(module: WebAssembly.Module): Record<string, WebAssembly.ImportValue> {
    const view = (): DataView => new DataView((this.ex as WasmExports).memory.buffer);
    const stubs: Record<string, (...args: number[]) => number> = {
      proc_exit: (code) => {
        throw new Error(`the converter called proc_exit(${code})`);
      },
      fd_write: (fd, iovs, iovsLen, nwritten) => {
        const m = this.mem();
        const v = view();
        let total = 0;
        let text = '';
        for (let i = 0; i < iovsLen; i++) {
          const ptr = v.getUint32(iovs + i * 8, true);
          const len = v.getUint32(iovs + i * 8 + 4, true);
          text += decoder.decode(m.subarray(ptr, ptr + len));
          total += len;
        }
        v.setUint32(nwritten, total, true);
        if (text.trim()) this.options.log?.(`[wasm fd ${fd}] ${text.trim()}`);
        return WASI_ESUCCESS;
      },
      fd_close: () => WASI_ESUCCESS,
      fd_seek: () => WASI_EBADF,
      fd_read: () => WASI_EBADF,
      fd_fdstat_get: () => WASI_EBADF,
      fd_fdstat_set_flags: () => WASI_EBADF,
      fd_prestat_get: () => WASI_EBADF,
      fd_prestat_dir_name: () => WASI_EBADF,
      path_open: () => WASI_ENOSYS,
      environ_sizes_get: (countPtr, sizePtr) => {
        view().setUint32(countPtr, 0, true);
        view().setUint32(sizePtr, 0, true);
        return WASI_ESUCCESS;
      },
      environ_get: () => WASI_ESUCCESS,
      args_sizes_get: (countPtr, sizePtr) => {
        view().setUint32(countPtr, 0, true);
        view().setUint32(sizePtr, 0, true);
        return WASI_ESUCCESS;
      },
      args_get: () => WASI_ESUCCESS,
      clock_time_get: (_id, _precision, outPtr) => {
        view().setBigUint64(outPtr, BigInt(Date.now()) * 1_000_000n, true);
        return WASI_ESUCCESS;
      },
      random_get: (ptr, len) => {
        const m = this.mem();
        for (let i = 0; i < len; i++) m[ptr + i] = Math.floor(Math.random() * 256);
        return WASI_ESUCCESS;
      },
      sched_yield: () => WASI_ESUCCESS,
    };
    const out: Record<string, WebAssembly.ImportValue> = {};
    for (const imp of WebAssembly.Module.imports(module)) {
      if (imp.module !== 'wasi_snapshot_preview1' || imp.kind !== 'function') continue;
      out[imp.name] = stubs[imp.name] ?? ((): number => WASI_ENOSYS);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ run

  private run(request: ConversionRequest): ConversionResponse {
    const ex = this.ex as WasmExports;
    this.current = { request, denied: [], allocated: [] };
    let inputPtr = 0;
    let optionsPtr = 0;
    try {
      const input = encoder.encode(request.text);
      inputPtr = this.writeBytes(input);
      optionsPtr = this.writeBytes(encoder.encode(JSON.stringify(request.options)));
      const rc = ex.adc_wasm_converter(inputPtr, input.length, request.format, optionsPtr);
      const messagesJson = this.readCString(ex.adc_wasm_mensagens());
      let messages: ConverterMessage[];
      try {
        messages = messagesJson ? (JSON.parse(messagesJson) as ConverterMessage[]) : [];
      } catch {
        messages = [{ nivel: 'erro', linha: 0, coluna: 0, texto: `the converter returned messages that are not JSON: ${messagesJson.slice(0, 200)}` }];
      }
      const output = rc === 0 ? this.readBytes(ex.adc_wasm_saida(), ex.adc_wasm_saida_tamanho()) : undefined;
      ex.adc_wasm_limpar();
      const response: ConversionResponse = { id: request.id, ok: rc === 0, rc, output, messages, denied: this.current.denied, version: this.readCString(ex.adc_wasm_versao()) };
      if (rc !== 0) response.error = `the converter returned ${RESULT_NAMES[rc] ?? rc}`;
      return response;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      // A trap leaves the instance in an unknown state: drop it so the next request reloads.
      this.instance = null;
      this.ex = null;
      this.loading = null;
      return { id: request.id, ok: false, rc: -2, messages: [], denied: this.current.denied, error: `The converter failed while producing the output (${detail}). The module will be reloaded on the next request; try again, and report the document if it repeats.` };
    } finally {
      if (this.ex) {
        for (const p of this.current.allocated) this.ex.adc_wasm_free(p);
        if (inputPtr) this.ex.adc_wasm_free(inputPtr);
        if (optionsPtr) this.ex.adc_wasm_free(optionsPtr);
      }
      this.current = null;
    }
  }
}

function isInside(file: string, folder: string): boolean {
  const rel = path.relative(folder, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
