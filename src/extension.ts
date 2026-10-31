// Extension entry point.
import * as vscode from 'vscode';
import { AsciiDocEditorProvider, EDITOR_VIEW_TYPE } from './editor/AsciiDocEditorProvider';
import { PreviewManager } from './preview/PreviewManager';
import { registerLanguageFeatures } from './language/registerLanguageFeatures';
import { registerExportCommands } from './export/registerExportCommands';
import { registerCheatSheet } from './cheatsheet/registerCheatSheet';
import { registerNewDocument } from './commands/newDocument';
import { registerOpenShowcase } from './commands/openShowcase';
import { toggleLocale } from './i18n/host';
import { disposeLogger, log, setDebugLogging } from './util/logger';

export function activate(context: vscode.ExtensionContext): void {
  const cfg = () => vscode.workspace.getConfiguration('tootegaAsciidoc');
  setDebugLogging(cfg().get<boolean>('debugLog', false));
  log('Tootega AsciiDoc activating…');

  const editor = AsciiDocEditorProvider.register(context);
  const preview = new PreviewManager(context);
  context.subscriptions.push(preview);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tootegaAsciidoc.debugLog')) setDebugLogging(cfg().get<boolean>('debugLog', false));
    }),
  );

  const activeAsciiDocUri = (resource?: vscode.Uri): vscode.Uri | undefined => {
    if (resource instanceof vscode.Uri) return resource;
    const session = editor.activeSession;
    if (session) return session.document.uri;
    const active = vscode.window.activeTextEditor;
    if (active && active.document.languageId === 'asciidoc') return active.document.uri;
    return preview.activeDocumentUri();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('tootegaAsciidoc.openWithTootega', async (resource?: vscode.Uri) => {
      const uri = activeAsciiDocUri(resource);
      if (!uri) {
        void vscode.window.showInformationMessage(vscode.l10n.t('Open an AsciiDoc file first.'));
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, EDITOR_VIEW_TYPE);
    }),
    vscode.commands.registerCommand('tootegaAsciidoc.showSource', async () => {
      if (editor.activeSession) {
        await editor.showSource();
        return;
      }
      await preview.showSource();
    }),
    vscode.commands.registerCommand('tootegaAsciidoc.mode.visual', () => editor.setMode('visual')),
    vscode.commands.registerCommand('tootegaAsciidoc.mode.code', () => editor.setMode('code')),
    vscode.commands.registerCommand('tootegaAsciidoc.mode.split', () => editor.setMode('split')),
    vscode.commands.registerCommand('tootegaAsciidoc.toggleStructure', () => editor.toggleStructure()),
    vscode.commands.registerCommand('tootegaAsciidoc.toggleLanguage', async () => {
      const locale = await toggleLocale();
      vscode.window.setStatusBarMessage(vscode.l10n.t('Language: {0}', locale), 3000);
    }),
  );

  registerLanguageFeatures(context, editor);
  registerExportCommands(context, activeAsciiDocUri);
  registerCheatSheet(context);
  registerNewDocument(context);
  registerOpenShowcase(context);

  log('Tootega AsciiDoc ready.');
}

export function deactivate(): void {
  disposeLogger();
}
