// Locale resolution on the host side. Host strings go through `vscode.l10n.t` (l10n/bundle.l10n.pt-br.json);
// the webview receives the resolved locale and uses its own catalogues.
import * as vscode from 'vscode';
import type { LocaleId } from '../../shared/protocol';

export function normalizeLocale(raw: string | undefined): LocaleId {
  return raw && raw.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function resolveLocale(): LocaleId {
  const cfg = vscode.workspace.getConfiguration('tootegaAsciidoc').get<string>('language', 'auto');
  const raw = cfg && cfg !== 'auto' ? cfg : vscode.env.language;
  return normalizeLocale(raw);
}

/** Toggles the manual override between pt-BR and English (global setting). */
export async function toggleLocale(): Promise<LocaleId> {
  const next: LocaleId = resolveLocale() === 'pt-BR' ? 'en' : 'pt-BR';
  await vscode.workspace.getConfiguration('tootegaAsciidoc').update('language', next, vscode.ConfigurationTarget.Global);
  return next;
}
