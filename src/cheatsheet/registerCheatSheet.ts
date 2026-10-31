// The AsciiDoc cheat sheet: a webview with the syntax every author forgets, in the interface language.
import * as vscode from 'vscode';
import { resolveLocale } from '../i18n/host';
import { makeNonce } from '../util/nonce';
import { CHEAT_SHEET } from './content';

export function registerCheatSheet(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand('tootegaAsciidoc.showCheatSheet', () => {
      if (panel) {
        panel.reveal();
        return;
      }
      panel = vscode.window.createWebviewPanel('tootega.asciidoc.cheatsheet', vscode.l10n.t('AsciiDoc cheat sheet'), vscode.ViewColumn.Beside, { enableScripts: false });
      panel.webview.html = html(resolveLocale());
      panel.onDidDispose(() => (panel = undefined));
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (panel && e.affectsConfiguration('tootegaAsciidoc.language')) panel.webview.html = html(resolveLocale());
    }),
  );
}

function html(locale: 'en' | 'pt-BR'): string {
  const sheet = CHEAT_SHEET[locale];
  const nonce = makeNonce();
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sections = sheet.sections
    .map(
      (s) => `<section><h2>${esc(s.title)}</h2><table><tbody>${s.rows.map((r) => `<tr><td><code>${esc(r[0])}</code></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></section>`,
    )
    .join('');
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';" />
<style nonce="${nonce}">
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:0 1.5rem 2rem;max-width:60rem}
h1{font-size:1.4rem;margin:1rem 0 .25rem}p.lead{color:var(--vscode-descriptionForeground);margin:0 0 1rem}
h2{font-size:1.05rem;margin:1.5rem 0 .5rem;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:.25rem}
table{border-collapse:collapse;width:100%}td{padding:.3rem .5rem;vertical-align:top;border-bottom:1px solid var(--vscode-panel-border)}
td:first-child{width:46%}code{font-family:var(--vscode-editor-font-family);white-space:pre-wrap;background:var(--vscode-textCodeBlock-background);padding:.1rem .3rem;border-radius:3px}
</style><title>${esc(sheet.title)}</title></head><body><h1>${esc(sheet.title)}</h1><p class="lead">${esc(sheet.lead)}</p>${sections}</body></html>`;
}
