// Wires the language features of the native text editor and the formatting commands shared with the custom editor.
import * as vscode from 'vscode';
import type { AsciiDocEditorProvider } from '../editor/AsciiDocEditorProvider';
import { AsciiDocCompletionItemProvider } from './completion';
import { AsciiDocDiagnostics } from './diagnostics';
import { AsciiDocFoldingRangeProvider } from './folding';
import { toggleInlineMark, type InlineMark } from './formatting';
import { AsciiDocHoverProvider } from './hover';
import { AsciiDocImagePasteProvider, PASTE_KIND, pasteImageCommand } from './imagePaste';
import { AsciiDocDocumentLinkProvider } from './links';
import { AsciiDocDocumentSymbolProvider, AsciiDocWorkspaceSymbolProvider } from './symbols';

const SELECTOR: vscode.DocumentSelector = { language: 'asciidoc' };

export function registerLanguageFeatures(context: vscode.ExtensionContext, editor: AsciiDocEditorProvider): void {
  const pasteProvider = new AsciiDocImagePasteProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(SELECTOR, new AsciiDocDocumentSymbolProvider()),
    vscode.languages.registerWorkspaceSymbolProvider(new AsciiDocWorkspaceSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(SELECTOR, new AsciiDocFoldingRangeProvider()),
    vscode.languages.registerDocumentLinkProvider(SELECTOR, new AsciiDocDocumentLinkProvider()),
    vscode.languages.registerHoverProvider(SELECTOR, new AsciiDocHoverProvider()),
    vscode.languages.registerCompletionItemProvider(SELECTOR, new AsciiDocCompletionItemProvider(), '{', '<', ':', '/'),
    vscode.languages.registerDocumentPasteEditProvider(SELECTOR, pasteProvider, {
      pasteMimeTypes: ['image/*', 'text/uri-list'],
      providedPasteEditKinds: [PASTE_KIND],
    }),
    vscode.languages.registerDocumentDropEditProvider(SELECTOR, pasteProvider, {
      dropMimeTypes: ['image/*', 'text/uri-list'],
      providedDropEditKinds: [PASTE_KIND],
    }),
    new AsciiDocDiagnostics(),
    vscode.commands.registerCommand('tootegaAsciidoc.pasteImage', pasteImageCommand),
    vscode.commands.registerCommand('tootegaAsciidoc.toggleBold', () => toggle(editor, 'bold', '*')),
    vscode.commands.registerCommand('tootegaAsciidoc.toggleItalic', () => toggle(editor, 'italic', '_')),
    vscode.commands.registerCommand('tootegaAsciidoc.toggleMonospace', () => toggle(editor, 'monospace', '`')),
  );
}

async function toggle(editor: AsciiDocEditorProvider, command: 'bold' | 'italic' | 'monospace', mark: InlineMark): Promise<void> {
  if (editor.sendCommand(command)) return;
  const active = vscode.window.activeTextEditor;
  if (active && active.document.languageId === 'asciidoc') await toggleInlineMark(active, mark);
}
