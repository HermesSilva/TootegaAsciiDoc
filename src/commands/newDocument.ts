// "New AsciiDoc document": asks where to save, writes a skeleton (title, author line, date, :toc:) and opens it in
// the Tootega editor. Untitled documents cannot be shown by a custom editor, so the file is created first.
import * as vscode from 'vscode';
import { EDITOR_VIEW_TYPE } from '../editor/AsciiDocEditorProvider';
import { resolveLocale } from '../i18n/host';
import { logError } from '../util/logger';

export function registerNewDocument(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('tootegaAsciidoc.newDocument', async (resource?: vscode.Uri) => {
      try {
        await newDocument(resource);
      } catch (e) {
        logError('newDocument', e);
        void vscode.window.showErrorMessage(vscode.l10n.t('The new document could not be created: {0}', e instanceof Error ? e.message : String(e)));
      }
    }),
  );
}

async function newDocument(resource?: vscode.Uri): Promise<void> {
  const folder = await defaultFolder(resource);
  const name = vscode.l10n.t('new-document');
  const target = await vscode.window.showSaveDialog({
    title: vscode.l10n.t('New AsciiDoc document'),
    defaultUri: folder ? vscode.Uri.joinPath(folder, `${name}.adoc`) : undefined,
    filters: { AsciiDoc: ['adoc', 'asciidoc', 'asc', 'ad'] },
    saveLabel: vscode.l10n.t('Create'),
  });
  if (!target) return;
  const uri = /\.(adoc|asciidoc|asc|ad)$/i.test(target.path) ? target : target.with({ path: `${target.path}.adoc` });
  await vscode.workspace.fs.writeFile(uri, Buffer.from(skeleton(uri), 'utf8'));
  await vscode.commands.executeCommand('vscode.openWith', uri, EDITOR_VIEW_TYPE);
}

/** Folder clicked in the Explorer, else the folder of the active document, else the first workspace folder. */
async function defaultFolder(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (resource instanceof vscode.Uri) {
    try {
      const stat = await vscode.workspace.fs.stat(resource);
      return (stat.type & vscode.FileType.Directory) !== 0 ? resource : vscode.Uri.joinPath(resource, '..');
    } catch {
      /* falls through to the other candidates */
    }
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active && active.scheme === 'file') return vscode.Uri.joinPath(active, '..');
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function skeleton(uri: vscode.Uri): string {
  const base = (uri.path.split('/').pop() ?? 'document').replace(/\.[^.]+$/, '');
  const title = base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const today = new Date().toISOString().slice(0, 10);
  const pt = resolveLocale() === 'pt-BR';
  const author = pt ? 'Nome do Autor <autor@exemplo.com.br>' : 'Author Name <author@example.org>';
  const intro = pt
    ? 'Escreva aqui. No modo *Visual* a barra de ferramentas insere títulos, listas, tabelas e imagens; kbd:[Ctrl+Alt+2] mostra o código AsciiDoc e kbd:[Ctrl+Alt+3] os dois lado a lado.'
    : 'Write here. In *Visual* mode the toolbar inserts headings, lists, tables and images; kbd:[Ctrl+Alt+2] shows the AsciiDoc source and kbd:[Ctrl+Alt+3] both side by side.';
  const section = pt ? 'Primeira seção' : 'First section';
  return `= ${title}\n${author}\nv0.1, ${today}\n:toc:\n:experimental:\n\n${intro}\n\n== ${section}\n\n`;
}
