import { randomBytes } from 'node:crypto';

/** Nonce for the webview Content-Security-Policy (script-src). */
export function makeNonce(): string {
  return randomBytes(16).toString('base64url');
}
