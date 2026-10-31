// Path resolution rules shared by the editor, the preview, the language features and the export:
//   - relative paths resolve against the document folder;
//   - images also honour `:imagesdir:` (document attribute), as Asciidoctor does;
//   - `{docdir}` is the document folder.
import * as vscode from 'vscode';
import { documentAttribute, imagesDirOf, isAbsoluteFsPath, isRemoteTarget } from '../../shared/attributes';

export { documentAttribute, isRemoteTarget as isRemote, isAbsoluteFsPath as isAbsolutePath };

export function imagesDir(document: vscode.TextDocument): string {
  return imagesDirOf(document.getText());
}

/** Resolves a target written in the document to a URI. `kind` 'image' applies `:imagesdir:`. */
export function resolveDocumentPath(document: vscode.TextDocument, target: string, kind: 'image' | 'text'): vscode.Uri {
  return resolveTargetPath(document.uri, document.getText(), target, kind);
}

/** Same as `resolveDocumentPath`, for callers that hold the text instead of a TextDocument (export worker). */
export function resolveTargetPath(documentUri: vscode.Uri, text: string, target: string, kind: 'image' | 'text'): vscode.Uri {
  const documentDir = vscode.Uri.joinPath(documentUri, '..');
  const cleaned = target.replace(/\{docdir\}/g, '.');
  if (isAbsoluteFsPath(cleaned)) return vscode.Uri.file(cleaned);
  if (kind === 'image') {
    const dir = imagesDirOf(text);
    if (dir && !isAbsoluteFsPath(dir)) return vscode.Uri.joinPath(documentDir, dir, cleaned);
    if (dir) return vscode.Uri.joinPath(vscode.Uri.file(dir), cleaned);
  }
  return vscode.Uri.joinPath(documentDir, cleaned);
}
