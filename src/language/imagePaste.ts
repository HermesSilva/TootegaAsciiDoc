// Paste and drop of images into the native text editor: the image is written next to the document (into
// :imagesdir: or `tootegaAsciidoc.images.pasteDirectory`) and an `image::name.png[]` macro is inserted. Dropped
// image FILES from the workspace are referenced in place; from outside the workspace they are copied in
// (`images.copyIntoWorkspace` = smart).
import * as vscode from 'vscode';
import { relativePath } from '../../shared/attributes';
import { imagesDir, isAbsolutePath } from './paths';
import { dlog, logError } from '../util/logger';

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|avif)$/;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

export const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('tootegaAsciidoc', 'image');

export class AsciiDocImagePasteProvider implements vscode.DocumentPasteEditProvider, vscode.DocumentDropEditProvider {
  async provideDocumentPasteEdits(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, _context: vscode.DocumentPasteEditContext, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit[] | undefined> {
    const edit = await this.editFor(document, ranges[0] ?? new vscode.Range(0, 0, 0, 0), dataTransfer, token);
    if (!edit) return undefined;
    const paste = new vscode.DocumentPasteEdit(edit.snippet, vscode.l10n.t('Insert image'), PASTE_KIND);
    paste.additionalEdit = edit.workspaceEdit;
    return [paste];
  }

  async provideDocumentDropEdits(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
    const edit = await this.editFor(document, new vscode.Range(position, position), dataTransfer, token);
    if (!edit) return undefined;
    const drop = new vscode.DocumentDropEdit(edit.snippet, vscode.l10n.t('Insert image'), PASTE_KIND);
    drop.additionalEdit = edit.workspaceEdit;
    return drop;
  }

  private async editFor(document: vscode.TextDocument, range: vscode.Range, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<{ snippet: vscode.SnippetString; workspaceEdit?: vscode.WorkspaceEdit } | undefined> {
    // 1) Image files (from the explorer or the OS).
    const uriList = await dataTransfer.get('text/uri-list')?.asString();
    if (uriList) {
      const uris = uriList
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#'))
        .map((s) => vscode.Uri.parse(s))
        .filter((u) => IMAGE_EXT.test(u.path));
      if (uris.length > 0) {
        const targets: string[] = [];
        const workspaceEdit = new vscode.WorkspaceEdit();
        for (const uri of uris) {
          if (token.isCancellationRequested) return undefined;
          targets.push(await this.referenceFor(document, uri, workspaceEdit));
        }
        return { snippet: new vscode.SnippetString(targets.map((t, i) => `image::${t}[\${${i + 1}:alt}]`).join('\n')), workspaceEdit };
      }
    }
    // 2) Image bytes (screenshot, copied image).
    for (const mime of dataTransfer) {
      const [type, item] = mime;
      if (!IMAGE_MIME.test(type)) continue;
      const file = item.asFile();
      if (!file) continue;
      const bytes = await file.data();
      if (token.isCancellationRequested) return undefined;
      const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/svg+xml' ? 'svg' : type.slice(6);
      const name = `${baseName(document)}-${stamp()}.${ext}`;
      const target = this.imageUri(document, name);
      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.createFile(target, { contents: bytes, overwrite: false });
      dlog('paste', `image ${bytes.byteLength} bytes → ${target.fsPath}`);
      return { snippet: new vscode.SnippetString(`image::${this.relative(document, target)}[\${1:alt}]`), workspaceEdit };
    }
    void range;
    return undefined;
  }

  /** Path to write in the macro for an existing image file; copies the file into the workspace when configured. */
  private async referenceFor(document: vscode.TextDocument, uri: vscode.Uri, workspaceEdit: vscode.WorkspaceEdit): Promise<string> {
    const policy = vscode.workspace.getConfiguration('tootegaAsciidoc').get<string>('images.copyIntoWorkspace', 'smart');
    const inWorkspace = vscode.workspace.getWorkspaceFolder(uri) !== undefined;
    if (policy === 'never' || inWorkspace) return this.relative(document, uri);
    const name = uri.path.split('/').pop() ?? `image-${stamp()}.png`;
    const target = this.imageUri(document, name);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      workspaceEdit.createFile(target, { contents: bytes, overwrite: false, ignoreIfExists: true });
    } catch (e) {
      logError('paste', e);
      return this.relative(document, uri);
    }
    return this.relative(document, target);
  }

  private imageUri(document: vscode.TextDocument, name: string): vscode.Uri {
    const configured = vscode.workspace.getConfiguration('tootegaAsciidoc').get<string>('images.pasteDirectory', '').trim();
    const dir = configured || imagesDir(document) || '.';
    const documentDir = vscode.Uri.joinPath(document.uri, '..');
    return isAbsolutePath(dir) ? vscode.Uri.joinPath(vscode.Uri.file(dir), name) : vscode.Uri.joinPath(documentDir, dir, name);
  }

  /** Path as it must appear in the macro: relative to :imagesdir: (or to the document when there is none). */
  private relative(document: vscode.TextDocument, uri: vscode.Uri): string {
    const base = vscode.Uri.joinPath(document.uri, '..', imagesDir(document) || '.');
    return relativePath(base.path, uri.path);
  }
}

export async function pasteImageCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'asciidoc') {
    void vscode.window.showInformationMessage(vscode.l10n.t("Pasting images needs the native text editor: open the file with 'Show source' and try again."));
    return;
  }
  await vscode.commands.executeCommand('editor.action.pasteAs', { kind: PASTE_KIND.value });
}

function baseName(document: vscode.TextDocument): string {
  const name = document.uri.path.split('/').pop() ?? 'image';
  return name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase() || 'image';
}

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
