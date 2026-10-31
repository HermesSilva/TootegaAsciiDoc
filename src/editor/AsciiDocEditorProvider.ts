// The custom editor: a webview running the TootegaWebUI AsciiDoc editor over a vscode.TextDocument.
//
// The TextDocument is the source of truth. Edits made in the webview arrive as full text; the host computes the
// minimal changed range and applies ONE WorkspaceEdit — so save, dirty state, hot exit, undo in the text editor,
// Git and diff all behave as for any file. Changes coming from elsewhere (another editor on the same file, Git,
// a formatter) flow back to the webview, which re-parses. An echo guard keeps the two from ping-ponging: the host
// remembers the text it last applied on behalf of the webview and skips the change event that text produces.
import * as vscode from 'vscode';
import type { EditorMode, HostToWebview, WebviewState, WebviewToHost } from '../../shared/protocol';
import { resolveLocale } from '../i18n/host';
import { dlog, log, logError } from '../util/logger';
import { makeNonce } from '../util/nonce';
import { minimalEdit } from './textDiff';
import { buildWebviewHtml } from './webviewHtml';
import { openResource } from './resourceOpener';

export const EDITOR_VIEW_TYPE = 'tootega.asciidoc.editor';

interface Session {
  document: vscode.TextDocument;
  panel: vscode.WebviewPanel;
  /** Text we applied from the webview and whose change event must not be echoed back. */
  lastAppliedText: string | null;
  mode: EditorMode;
  structureOpen: boolean;
  state: WebviewState;
  ready: boolean;
}

export class AsciiDocEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly sessions = new Map<string, Session>();
  private active: Session | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceState: vscode.Memento,
  ) {}

  static register(context: vscode.ExtensionContext): AsciiDocEditorProvider {
    const provider = new AsciiDocEditorProvider(context.extensionUri, context.workspaceState);
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(EDITOR_VIEW_TYPE, provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }),
    );
    return provider;
  }

  /** Session of the custom editor that has focus (undefined when a text editor or another panel is active). */
  get activeSession(): Session | undefined {
    return this.active;
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
    const key = document.uri.toString();
    const cfg = vscode.workspace.getConfiguration('tootegaAsciidoc');
    const remembered = this.workspaceState.get<WebviewState>(this.stateKey(document.uri)) ?? {};
    const session: Session = {
      document,
      panel,
      lastAppliedText: null,
      mode: remembered.mode ?? modeFromConfig(cfg.get<string>('defaultMode', 'visual')),
      structureOpen: remembered.structureOpen ?? cfg.get<boolean>('structurePanel', false),
      state: remembered,
      ready: false,
    };
    this.sessions.set(key, session);
    this.active = session;
    dlog('editor', `resolve ${key}`);

    const documentDir = vscode.Uri.joinPath(document.uri, '..');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        documentDir,
        ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
      ],
    };
    panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri, {
      view: 'editor',
      nonce: makeNonce(),
      locale: resolveLocale(),
      allowRemoteImages: cfg.get<boolean>('images.allowRemote', true),
    });

    const subscriptions: vscode.Disposable[] = [];

    subscriptions.push(
      panel.webview.onDidReceiveMessage((message: WebviewToHost) => {
        void this.onMessage(session, message);
      }),
    );

    subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== key) return;
        if (e.contentChanges.length === 0) return;
        const text = e.document.getText();
        if (session.lastAppliedText !== null && text === session.lastAppliedText) {
          // Our own edit coming back: the webview already has it.
          session.lastAppliedText = null;
          return;
        }
        session.lastAppliedText = null;
        dlog('editor', `external change v${e.document.version} → webview`);
        this.post(session, { type: 'update', text, version: e.document.version });
      }),
    );

    subscriptions.push(
      panel.onDidChangeViewState(() => {
        if (panel.active) this.active = session;
        else if (this.active === session) this.active = undefined;
        void vscode.commands.executeCommand('setContext', 'tootegaAsciidoc.editorMode', panel.active ? session.mode : undefined);
      }),
    );

    subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tootegaAsciidoc.language')) this.post(session, { type: 'setLocale', locale: resolveLocale() });
      }),
    );

    panel.onDidDispose(() => {
      for (const s of subscriptions) s.dispose();
      this.sessions.delete(key);
      if (this.active === session) this.active = undefined;
      dlog('editor', `dispose ${key}`);
    });

    void vscode.commands.executeCommand('setContext', 'tootegaAsciidoc.editorMode', session.mode);
  }

  // ------------------------------------------------------------------------------------------------ commands

  setMode(mode: EditorMode): void {
    const s = this.active;
    if (!s) return;
    s.mode = mode;
    this.post(s, { type: 'setMode', mode });
    this.remember(s);
    void vscode.commands.executeCommand('setContext', 'tootegaAsciidoc.editorMode', mode);
  }

  toggleStructure(): void {
    const s = this.active;
    if (!s) return;
    s.structureOpen = !s.structureOpen;
    this.post(s, { type: 'toggleStructure' });
    this.remember(s);
  }

  sendCommand(command: 'undo' | 'redo' | 'bold' | 'italic' | 'monospace' | 'find'): boolean {
    const s = this.active;
    if (!s) return false;
    this.post(s, { type: 'command', command });
    return true;
  }

  /** Opens the native text editor on the document of the active session (the "Show source" command). */
  async showSource(): Promise<void> {
    const s = this.active;
    if (!s) return;
    await vscode.commands.executeCommand('vscode.openWith', s.document.uri, 'default', s.panel.viewColumn);
  }

  // ------------------------------------------------------------------------------------------------ messages

  private async onMessage(session: Session, message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case 'ready': {
        session.ready = true;
        const document = session.document;
        const documentDir = vscode.Uri.joinPath(document.uri, '..');
        const cfg = vscode.workspace.getConfiguration('tootegaAsciidoc');
        this.post(session, {
          type: 'init',
          view: 'editor',
          text: document.getText(),
          version: document.version,
          uri: document.uri.toString(),
          fileName: document.fileName,
          documentDirUri: session.panel.webview.asWebviewUri(documentDir).toString(),
          locale: resolveLocale(),
          mode: session.mode,
          readOnly: false,
          structureOpen: session.structureOpen,
          allowRemoteImages: cfg.get<boolean>('images.allowRemote', true),
          state: session.state,
        });
        return;
      }
      case 'edit':
        await this.applyEdit(session, message.text, message.baseVersion);
        return;
      case 'modeChanged':
        session.mode = message.mode;
        this.remember(session);
        void vscode.commands.executeCommand('setContext', 'tootegaAsciidoc.editorMode', message.mode);
        return;
      case 'state':
        session.state = { ...session.state, ...message.state };
        if (message.state.structureOpen !== undefined) session.structureOpen = message.state.structureOpen;
        this.remember(session);
        return;
      case 'openResource':
        await openResource(session.document, message.kind, message.target);
        return;
      case 'log':
        if (message.level === 'error') log(`[webview] ERROR ${message.message}`);
        else dlog('webview', message.message);
        return;
      default:
        return;
    }
  }

  private async applyEdit(session: Session, newText: string, baseVersion: number): Promise<void> {
    const document = session.document;
    const oldText = document.getText();
    if (baseVersion < document.version && oldText !== newText && session.lastAppliedText === null) {
      // The webview edited a version the document already moved past (an external change raced it). The
      // document wins; the webview re-parses the current text — nothing of the user's is lost silently
      // because the external change has already been pushed to it as an 'update'.
      dlog('editor', `stale edit (base v${baseVersion}, document v${document.version}) ignored`);
    }
    const edit = minimalEdit(oldText, newText);
    if (!edit) return;
    const range = new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end));
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(document.uri, range, edit.text);
    session.lastAppliedText = newText;
    const ok = await vscode.workspace.applyEdit(workspaceEdit);
    if (!ok) {
      session.lastAppliedText = null;
      const message = vscode.l10n.t(
        'The edit from the editor could not be applied to {0} (VS Code refused the workspace edit). The document on disk is unchanged; copy your text and reopen the file.',
        document.fileName,
      );
      logError('editor', message);
      void vscode.window.showErrorMessage(message);
      // Put the webview back in sync with the document.
      this.post(session, { type: 'update', text: document.getText(), version: document.version });
    }
  }

  private post(session: Session, message: HostToWebview): void {
    try {
      void session.panel.webview.postMessage(message);
    } catch (e) {
      logError('editor', e);
    }
  }

  private stateKey(uri: vscode.Uri): string {
    return `tootegaAsciidoc.state:${uri.toString()}`;
  }

  private remember(session: Session): void {
    const state: WebviewState = { ...session.state, mode: session.mode, structureOpen: session.structureOpen };
    void this.workspaceState.update(this.stateKey(session.document.uri), state);
  }
}

export function modeFromConfig(value: string): EditorMode {
  return value === 'code' || value === 'split' ? value : 'visual';
}
