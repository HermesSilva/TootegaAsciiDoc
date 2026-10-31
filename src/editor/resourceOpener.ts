// Opens a resource referenced by the document: include:: and xref: targets open as text (or in the Tootega
// editor when they are AsciiDoc), images open in VS Code's image viewer, links open in the browser.
import * as vscode from 'vscode';
import type { ResourceKind } from '../../shared/protocol';
import { resolveDocumentPath } from '../language/paths';
import { logError } from '../util/logger';

export async function openResource(document: vscode.TextDocument, kind: ResourceKind, target: string): Promise<void> {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || target.startsWith('mailto:')) {
      await vscode.env.openExternal(vscode.Uri.parse(target));
      return;
    }
    // xref:path.adoc#anchor[] / <<path.adoc#anchor>> → drop the anchor when it points to another file.
    const [path] = kind === 'xref' ? target.split('#') : [target];
    if (kind === 'xref' && !path) return; // same-document anchor: the webview handles it
    const uri = resolveDocumentPath(document, path, kind === 'image' ? 'image' : 'text');
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Included file not found: {0} (looked in {1})', target, vscode.Uri.joinPath(uri, '..').fsPath),
      );
      return;
    }
    if (kind === 'image') {
      await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);
      return;
    }
    await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);
  } catch (e) {
    logError('openResource', e);
    void vscode.window.showErrorMessage(vscode.l10n.t('Cannot open {0}: {1}', target, e instanceof Error ? e.message : String(e)));
  }
}
