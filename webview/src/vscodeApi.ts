// Access to the VS Code webview API.
import type { WebviewState, WebviewToHost } from '../../shared/protocol';

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!api) api = acquireVsCodeApi();
  return api;
}

export function send(msg: WebviewToHost): void {
  getVsCodeApi().postMessage(msg);
}

/** Lightweight state kept by VS Code across webview reloads (survives hiding and restarts). */
export function saveState(patch: WebviewState): void {
  const current = getVsCodeApi().getState<WebviewState>() ?? {};
  getVsCodeApi().setState({ ...current, ...patch });
}

export function readState(): WebviewState {
  return getVsCodeApi().getState<WebviewState>() ?? {};
}
