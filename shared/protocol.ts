// Message protocol between the extension host and the React webview (custom editor and side preview).
// Every message is a discriminated union on `type`; unknown messages are ignored by both sides.

/** Editor mode — the engine's `ModoDoEditor` in English, as the configuration exposes it. */
export type EditorMode = 'visual' | 'code' | 'split';

export type LocaleId = 'en' | 'pt-BR';

/** What the webview renders: the full editor or the read-only preview panel. */
export type ViewKind = 'editor' | 'preview';

/** Kinds of resources the document may reference. */
export type ResourceKind = 'image' | 'video' | 'audio' | 'include' | 'xref' | 'link';

export interface WebviewState {
  mode?: EditorMode;
  structureOpen?: boolean;
  splitRatio?: number;
  scrollTop?: number;
}

/** Sent once, when the webview is ready, and again whenever the whole context changes (e.g. the preview retargets). */
export interface InitMessage {
  type: 'init';
  view: ViewKind;
  text: string;
  version: number;
  /** Document URI as a string (for display and for the webview to key its state). */
  uri: string;
  fileName: string;
  /** Webview-safe URI of the document folder — base for relative images. */
  documentDirUri: string;
  locale: LocaleId;
  mode: EditorMode;
  readOnly: boolean;
  structureOpen: boolean;
  allowRemoteImages: boolean;
  state?: WebviewState;
}

/** The document text changed on the host side (another editor, Git, undo in the text editor…). */
export interface UpdateMessage {
  type: 'update';
  text: string;
  version: number;
}

export interface SetModeMessage {
  type: 'setMode';
  mode: EditorMode;
}

export interface ToggleStructureMessage {
  type: 'toggleStructure';
}

/** A formatting or editing command triggered from the host (keybinding or command palette). */
export interface CommandMessage {
  type: 'command';
  command: 'undo' | 'redo' | 'bold' | 'italic' | 'monospace' | 'find';
}

/** Scroll the preview so the given source line is visible (side preview). */
export interface RevealLineMessage {
  type: 'revealLine';
  line: number;
}

export interface LocaleMessage {
  type: 'setLocale';
  locale: LocaleId;
}

export type HostToWebview =
  | InitMessage
  | UpdateMessage
  | SetModeMessage
  | ToggleStructureMessage
  | CommandMessage
  | RevealLineMessage
  | LocaleMessage;

// ---------------------------------------------------------------------------------------------------------------

export interface ReadyMessage {
  type: 'ready';
}

/** The user edited the document in the webview: full text, so the host diffs and applies a minimal edit. */
export interface EditMessage {
  type: 'edit';
  text: string;
  /** Version the webview was based on; the host ignores stale echoes. */
  baseVersion: number;
}

export interface ModeChangedMessage {
  type: 'modeChanged';
  mode: EditorMode;
}

export interface StateMessage {
  type: 'state';
  state: WebviewState;
}

/** The user activated a reference: include, xref, link or image — the host decides how to open it. */
export interface OpenResourceMessage {
  type: 'openResource';
  kind: ResourceKind;
  target: string;
}

/** The preview was scrolled; the host may sync the text editor. `line` is the first visible source line (1-based). */
export interface ScrolledMessage {
  type: 'scrolled';
  line: number;
}

/** Double-click in the preview: jump to the source line. */
export interface GoToSourceMessage {
  type: 'goToSource';
  line: number;
}

export interface LogMessage {
  type: 'log';
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type WebviewToHost =
  | ReadyMessage
  | EditMessage
  | ModeChangedMessage
  | StateMessage
  | OpenResourceMessage
  | ScrolledMessage
  | GoToSourceMessage
  | LogMessage;
