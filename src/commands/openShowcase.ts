// "Open the AsciiDoc showcase": the complete example that ships with the extension (media/showcase, one document per
// interface language, with its includes, code snippet and images). It is copied to the extension's global storage
// before opening, so the user can edit it freely and the packaged original is restored on the next run.
import * as vscode from 'vscode';
import { EDITOR_VIEW_TYPE } from '../editor/AsciiDocEditorProvider';
import { resolveLocale } from '../i18n/host';
import { logError } from '../util/logger';

const MAIN_FILE: Record<'en' | 'pt-BR', string> = { en: 'en/showcase.adoc', 'pt-BR': 'pt-BR/exemplo-completo.adoc' };

export function registerOpenShowcase(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('tootegaAsciidoc.openShowcase', async () => {
      try {
        const source = vscode.Uri.joinPath(context.extensionUri, 'media', 'showcase');
        const target = vscode.Uri.joinPath(context.globalStorageUri, 'showcase');
        await copyTree(source, target);
        const main = vscode.Uri.joinPath(target, ...MAIN_FILE[resolveLocale()].split('/'));
        await vscode.commands.executeCommand('vscode.openWith', main, EDITOR_VIEW_TYPE);
      } catch (e) {
        logError('openShowcase', e);
        void vscode.window.showErrorMessage(vscode.l10n.t('The showcase document could not be opened: {0}', e instanceof Error ? e.message : String(e)));
      }
    }),
  );
}

/** Copies a folder recursively, overwriting files (restores the original showcase). */
async function copyTree(source: vscode.Uri, target: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(target);
  for (const [name, type] of await vscode.workspace.fs.readDirectory(source)) {
    const from = vscode.Uri.joinPath(source, name);
    const to = vscode.Uri.joinPath(target, name);
    if ((type & vscode.FileType.Directory) !== 0) await copyTree(from, to);
    else await vscode.workspace.fs.copy(from, to, { overwrite: true });
  }
}
