// The HTML shell of both webviews (custom editor and side preview). One bundle, one stylesheet, CSP with a nonce.
import * as vscode from 'vscode';
import type { LocaleId, ViewKind } from '../../shared/protocol';

export interface WebviewHtmlOptions {
  view: ViewKind;
  nonce: string;
  locale: LocaleId;
  allowRemoteImages: boolean;
}

export function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, options: WebviewHtmlOptions): string {
  const base = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'main.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'main.css'));
  const imgSources = [webview.cspSource, 'data:', 'blob:'];
  if (options.allowRemoteImages) imgSources.push('https:');
  const csp = [
    `default-src 'none'`,
    `img-src ${imgSources.join(' ')}`,
    `media-src ${webview.cspSource} ${options.allowRemoteImages ? 'https:' : ''}`.trim(),
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${options.nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');
  const boot = {
    view: options.view,
    locale: options.locale,
  };
  return `<!DOCTYPE html>
<html lang="${options.locale}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Tootega AsciiDoc</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${options.nonce}">window.__TOOTEGA_BOOT__ = ${JSON.stringify(boot)};</script>
  <script nonce="${options.nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
