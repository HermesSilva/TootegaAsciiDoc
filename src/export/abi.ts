// Contract between the extension and the AsciiDocConverter WebAssembly module (wasm/adc_wasm.c in the
// AsciiDocConverter repository). Keep the two in step: a mismatch here is a runtime error with a clear message, never
// a silent one.

export const WASM_FILE = 'AsciiDocConverter.wasm';

/** Output formats of ADC_Converter (include/adc.h). */
export enum ExportFormat {
  HTML5 = 1,
  Markdown = 2,
  PDF = 3,
  ASG = 4,
  DocBook5 = 5,
}

/** Result codes of ADC_Converter (include/adc.h). */
export const RESULT_NAMES: Record<number, string> = {
  0: 'ADC_OK',
  1: 'ADC_ERRO_PARAMETRO',
  2: 'ADC_ERRO_ENTRADA',
  3: 'ADC_ERRO_FORMATO',
  4: 'ADC_ERRO_LIMITE',
  5: 'ADC_ERRO_OPCOES',
  6: 'ADC_ERRO_CONVERSAO',
  7: 'ADC_ERRO_MEMORIA',
};

/** Resource kinds asked through the resolver import. */
export enum ResourceType {
  Include = 1,
  Image = 2,
  Stylesheet = 3,
}

/** Exports the module must provide. */
export interface WasmExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  adc_wasm_alloc: (size: number) => number;
  adc_wasm_free: (ptr: number) => void;
  /** Runs the conversion; outputs are read with the getters below and released by `adc_wasm_limpar`. */
  adc_wasm_converter: (input: number, length: number, format: number, optionsJson: number) => number;
  adc_wasm_saida: () => number;
  adc_wasm_saida_tamanho: () => number;
  adc_wasm_mensagens: () => number;
  adc_wasm_limpar: () => void;
  adc_wasm_versao: () => number;
  /** Called by the resolver import (JS) to hand back the resolved content and its resolved path. */
  adc_wasm_resolvido: (content: number, length: number, path: number, pathLength: number) => void;
}

/** One message of the converter (messages JSON v2). */
export interface ConverterMessage {
  nivel: 'aviso' | 'erro';
  linha: number;
  coluna: number;
  texto: string;
  /** File the line belongs to (empty for the root document). */
  arquivo?: string;
}

export interface ConversionRequest {
  id: number;
  text: string;
  format: ExportFormat;
  /** Options JSON object for pOpcoesJSON (atributos, autonomo, idioma, dataUri, pdf, limites). */
  options: Record<string, unknown>;
  /** File system path of the document (resolver base). */
  documentPath: string;
  /** Workspace folder paths — resources outside them are denied unless `allowOutsideWorkspace`. */
  workspaceFolders: string[];
  allowOutsideWorkspace: boolean;
  /** `:imagesdir:` of the root document, already resolved to an absolute path ('' when none). */
  imagesDir: string;
}

export interface ConversionResponse {
  id: number;
  ok: boolean;
  rc: number;
  output?: Uint8Array;
  messages: ConverterMessage[];
  /** Paths the resolver denied (outside the workspace) — reported, never silent. */
  denied: string[];
  version?: string;
  /** Fatal error (module missing, trap…), already a user-readable sentence. */
  error?: string;
}
