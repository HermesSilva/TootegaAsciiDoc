// The side preview: a webview panel next to the native text editor that renders the engine's view read-only.
// One dynamic preview follows the active AsciiDoc editor; locked previews stay on their document. Scroll sync in
// both directions through source lines (the engine stamps `data-linha` on every block).
import * as vscode from 'vscode';
import type { HostToWebview, WebviewToHost } from '../../shared/protocol';
import { buildWebviewHtml } from '../editor/webviewHtml';
import { openResource } from '../editor/resourceOpener';
import { resolveLocale } from '../i18n/host';
import { dlog, logError } from '../util/logger';
import { makeNonce } from '../util/nonce';

export const PREVIEW_VIEW_TYPE = 'tootega.asciidoc.preview';

interface PreviewPanel {
  panel: vscode.WebviewPanel;
  uri: vscode.Uri;
  locked: boolean;
  ready: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Last line we scrolled the editor to (so its own scroll event does not bounce back). */
  lastEditorLine: number;
  lastPreviewLine: number;
}

interface SerializedState {
  uri?: string;
  locked?: boolean;
}

export class PreviewManager implements vscode.Disposable {
  private readonly previews: PreviewPanel[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.commands.registerCommand('tootegaAsciidoc.showPreviewToSide', (resource?: vscode.Uri) => this.show(resource, false)),
      vscode.commands.registerCommand('tootegaAsciidoc.showLockedPreviewToSide', (resource?: vscode.Uri) => this.show(resource, true)),
      vscode.commands.registerCommand('tootegaAsciidoc.preview.toggleLock', () => this.toggleLock()),
      vscode.commands.registerCommand('tootegaAsciidoc.preview.refresh', () => this.refreshActive()),
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChanged(e.document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.onActiveEditorChanged(editor)),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => this.onEditorScrolled(e.textEditor)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tootegaAsciidoc.language')) for (const p of this.previews) this.post(p, { type: 'setLocale', locale: resolveLocale() });
      }),
      vscode.window.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, {
        deserializeWebviewPanel: async (panel: vscode.WebviewPanel, state: SerializedState | undefined) => {
          const uri = state?.uri ? vscode.Uri.parse(state.uri) : this.activeAsciiDocUri();
          if (!uri) {
            panel.dispose();
            return;
          }
          this.attach(panel, uri, state?.locked ?? false);
        },
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const p of [...this.previews]) p.panel.dispose();
  }

  /** Document of the active preview panel, if a preview has focus. */
  activeDocumentUri(): vscode.Uri | undefined {
    return this.previews.find((p) => p.panel.active)?.uri;
  }

  async showSource(): Promise<void> {
    const active = this.previews.find((p) => p.panel.active);
    if (!active) return;
    await vscode.window.showTextDocument(active.uri, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
  }

  // ---------------------------------------------------------------------------------------------- commands

  private show(resource: vscode.Uri | undefined, locked: boolean): void {
    const uri = resource instanceof vscode.Uri ? resource : this.activeAsciiDocUri();
    if (!uri) {
      void vscode.window.showInformationMessage(vscode.l10n.t('Open an AsciiDoc file first.'));
      return;
    }
    const existing = this.previews.find((p) => (locked ? p.locked && p.uri.toString() === uri.toString() : !p.locked));
    if (existing) {
      existing.panel.reveal(undefined, true);
      if (!locked && existing.uri.toString() !== uri.toString()) this.retarget(existing, uri);
      return;
    }
    const column = vscode.window.activeTextEditor?.viewColumn;
    const panel = vscode.window.createWebviewPanel(PREVIEW_VIEW_TYPE, this.title(uri, locked), { viewColumn: column ? column + 1 : vscode.ViewColumn.Beside, preserveFocus: true }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: this.roots(uri),
    });
    this.attach(panel, uri, locked);
  }

  private toggleLock(): void {
    const active = this.previews.find((p) => p.panel.active) ?? this.previews[0];
    if (!active) return;
    active.locked = !active.locked;
    active.panel.title = this.title(active.uri, active.locked);
    vscode.window.setStatusBarMessage(active.locked ? vscode.l10n.t('The preview is locked to {0}.', basename(active.uri)) : vscode.l10n.t('The preview follows the active editor.'), 3000);
  }

  private refreshActive(): void {
    const active = this.previews.find((p) => p.panel.active) ?? this.previews[0];
    if (active) void this.sendInit(active);
  }

  // ---------------------------------------------------------------------------------------------- lifecycle

  private attach(panel: vscode.WebviewPanel, uri: vscode.Uri, locked: boolean): void {
    const preview: PreviewPanel = { panel, uri, locked, ready: false, timer: null, lastEditorLine: -1, lastPreviewLine: -1 };
    this.previews.push(preview);
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icon.svg');
    panel.webview.options = { enableScripts: true, localResourceRoots: this.roots(uri) };
    const cfg = vscode.workspace.getConfiguration('tootegaAsciidoc');
    panel.webview.html = buildWebviewHtml(panel.webview, this.context.extensionUri, {
      view: 'preview',
      nonce: makeNonce(),
      locale: resolveLocale(),
      allowRemoteImages: cfg.get<boolean>('images.allowRemote', true),
    });
    const sub = panel.webview.onDidReceiveMessage((m: WebviewToHost) => void this.onMessage(preview, m));
    panel.onDidDispose(() => {
      sub.dispose();
      if (preview.timer) clearTimeout(preview.timer);
      const i = this.previews.indexOf(preview);
      if (i >= 0) this.previews.splice(i, 1);
    });
    dlog('preview', `attached to ${uri.toString()} (locked=${locked})`);
  }

  private retarget(preview: PreviewPanel, uri: vscode.Uri): void {
    preview.uri = uri;
    preview.panel.title = this.title(uri, preview.locked);
    preview.panel.webview.options = { enableScripts: true, localResourceRoots: this.roots(uri) };
    preview.lastEditorLine = -1;
    preview.lastPreviewLine = -1;
    void this.sendInit(preview);
  }

  private async sendInit(preview: PreviewPanel): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(preview.uri);
      const cfg = vscode.workspace.getConfiguration('tootegaAsciidoc');
      this.post(preview, {
        type: 'init',
        view: 'preview',
        text: document.getText(),
        version: document.version,
        uri: document.uri.toString(),
        fileName: basename(document.uri),
        documentDirUri: preview.panel.webview.asWebviewUri(vscode.Uri.joinPath(document.uri, '..')).toString(),
        locale: resolveLocale(),
        mode: 'visual',
        readOnly: true,
        structureOpen: false,
        allowRemoteImages: cfg.get<boolean>('images.allowRemote', true),
      });
      void preview.panel.webview.postMessage({ __state: { uri: preview.uri.toString(), locked: preview.locked } satisfies SerializedState });
      const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === preview.uri.toString());
      if (editor) this.revealEditorLine(preview, editor);
    } catch (e) {
      logError('preview', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Cannot open {0}: {1}', preview.uri.fsPath, e instanceof Error ? e.message : String(e)));
    }
  }

  private async onMessage(preview: PreviewPanel, message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case 'ready':
        preview.ready = true;
        await this.sendInit(preview);
        return;
      case 'scrolled': {
        if (!vscode.workspace.getConfiguration('tootegaAsciidoc').get<boolean>('preview.scrollEditorWithPreview', true)) return;
        const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === preview.uri.toString());
        if (!editor || message.line === preview.lastEditorLine) return;
        preview.lastPreviewLine = message.line;
        preview.lastEditorLine = message.line;
        const line = Math.max(0, Math.min(editor.document.lineCount - 1, message.line - 1));
        editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
        return;
      }
      case 'goToSource': {
        const document = await vscode.workspace.openTextDocument(preview.uri);
        const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
        const line = Math.max(0, Math.min(document.lineCount - 1, message.line - 1));
        editor.selection = new vscode.Selection(line, 0, line, 0);
        editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
        return;
      }
      case 'openResource': {
        const document = await vscode.workspace.openTextDocument(preview.uri);
        await openResource(document, message.kind, message.target);
        return;
      }
      case 'log':
        if (message.level === 'error') logError('preview-webview', message.message);
        else dlog('preview-webview', message.message);
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------------------------------------- following

  private onDocumentChanged(document: vscode.TextDocument): void {
    if (document.languageId !== 'asciidoc') return;
    const interval = vscode.workspace.getConfiguration('tootegaAsciidoc').get<number>('preview.refreshInterval', 300);
    for (const preview of this.previews) {
      if (preview.uri.toString() !== document.uri.toString() || !preview.ready) continue;
      if (preview.timer) clearTimeout(preview.timer);
      preview.timer = setTimeout(() => {
        preview.timer = null;
        this.post(preview, { type: 'update', text: document.getText(), version: document.version });
      }, Math.max(50, interval));
    }
  }

  private onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'asciidoc') return;
    for (const preview of this.previews) {
      if (preview.locked || preview.uri.toString() === editor.document.uri.toString()) continue;
      this.retarget(preview, editor.document.uri);
    }
  }

  private onEditorScrolled(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'asciidoc') return;
    if (!vscode.workspace.getConfiguration('tootegaAsciidoc').get<boolean>('preview.scrollPreviewWithEditor', true)) return;
    for (const preview of this.previews) {
      if (preview.uri.toString() !== editor.document.uri.toString() || !preview.ready) continue;
      this.revealEditorLine(preview, editor);
    }
  }

  private revealEditorLine(preview: PreviewPanel, editor: vscode.TextEditor): void {
    const first = editor.visibleRanges[0];
    if (!first) return;
    const line = first.start.line + 1;
    if (line === preview.lastPreviewLine) return; // the preview just told us about this line
    preview.lastEditorLine = line;
    this.post(preview, { type: 'revealLine', line });
  }

  // ---------------------------------------------------------------------------------------------- helpers

  private post(preview: PreviewPanel, message: HostToWebview): void {
    try {
      void preview.panel.webview.postMessage(message);
    } catch (e) {
      logError('preview', e);
    }
  }

  private roots(uri: vscode.Uri): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      vscode.Uri.joinPath(uri, '..'),
      ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
    ];
  }

  private title(uri: vscode.Uri, locked: boolean): string {
    const name = basename(uri);
    return locked ? vscode.l10n.t('[Preview] {0}', name) : vscode.l10n.t('Preview: {0}', name);
  }

  private activeAsciiDocUri(): vscode.Uri | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && active.document.languageId === 'asciidoc') return active.document.uri;
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const input = tab?.input as { uri?: vscode.Uri } | undefined;
    if (input?.uri && /\.(adoc|asciidoc|asc|ad)$/i.test(input.uri.path)) return input.uri;
    return undefined;
  }
}

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').pop() ?? uri.path;
}
