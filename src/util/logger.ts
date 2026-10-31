// Output channel of the extension. `log` always writes; `dlog` only when `tootegaAsciidoc.debugLog` is on.
import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;
let debug = false;

function get(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel('Tootega AsciiDoc');
  return channel;
}

export function setDebugLogging(on: boolean): void {
  debug = on;
}

export function log(message: string): void {
  get().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function dlog(scope: string, message: string): void {
  if (debug) get().appendLine(`[${new Date().toISOString()}] [${scope}] ${message}`);
}

export function logError(scope: string, error: unknown): void {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  get().appendLine(`[${new Date().toISOString()}] [${scope}] ERROR ${text}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}
