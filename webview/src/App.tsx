// The webview root: boots from the host's `init` message, renders the editor (custom editor) or the read-only
// preview (side panel) and keeps the text in sync with the host — edits go out as full text (the host applies a
// minimal WorkspaceEdit), external changes come in as `update`.
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { XEditorAsciiDoc, type ComandoDaBarra, type ModoDoEditor, type TipoDeRecurso, type XEditorAsciiDocHandle } from '@core/components/asciidoc';
import type { EditorMode, HostToWebview, InitMessage, LocaleId, ResourceKind, ViewKind } from '../../shared/protocol';
import { imagesDirOf, isRemoteTarget, isAbsoluteFsPath, joinUrl } from '../../shared/attributes';
import { createTranslator, engineTexts, type Translator } from './i18n';
import { readState, saveState, send } from './vscodeApi';
import { PreviewView } from './PreviewView';

const EDIT_DEBOUNCE_MS = 120;

const MODE_TO_ENGINE: Record<EditorMode, ModoDoEditor> = { visual: 'visual', code: 'codigo', split: 'dividido' };
const MODE_FROM_ENGINE: Record<ModoDoEditor, EditorMode> = { visual: 'visual', codigo: 'code', dividido: 'split' };
const RESOURCE_KIND: Record<TipoDeRecurso, ResourceKind> = { imagem: 'image', video: 'video', audio: 'audio', inclusao: 'include', referencia: 'xref', link: 'link' };

export interface AppProps {
  view: ViewKind;
  initialLocale: LocaleId;
}

interface DocumentState {
  text: string;
  version: number;
}

export function App({ view, initialLocale }: AppProps): JSX.Element {
  const [init, setInit] = useState<InitMessage | null>(null);
  const [doc, setDoc] = useState<DocumentState>({ text: '', version: 0 });
  const [locale, setLocale] = useState<LocaleId>(initialLocale);
  const [mode, setMode] = useState<EditorMode>('visual');
  const [structureOpen, setStructureOpen] = useState(false);
  const [revealLine, setRevealLine] = useState<number | undefined>(undefined);
  const editor = useRef<XEditorAsciiDocHandle>(null);
  const pendingEdit = useRef<string | null>(null);
  const pendingTimer = useRef<number | null>(null);
  const versionRef = useRef(0);
  versionRef.current = doc.version;

  const t = useMemo(() => createTranslator(locale), [locale]);

  const flushEdit = useCallback(() => {
    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    if (pendingEdit.current === null) return;
    const text = pendingEdit.current;
    pendingEdit.current = null;
    send({ type: 'edit', text, baseVersion: versionRef.current });
  }, []);

  // Host → webview.
  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebview>): void => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      switch (message.type) {
        case 'init':
          setInit(message);
          setDoc({ text: message.text, version: message.version });
          setLocale(message.locale);
          setMode(message.state?.mode ?? message.mode);
          setStructureOpen(message.state?.structureOpen ?? message.structureOpen);
          return;
        case 'update':
          // The document moved on the host side: drop whatever we had not sent yet — the host already holds the
          // truth and pushed it to us — and re-parse.
          pendingEdit.current = null;
          if (pendingTimer.current !== null) {
            window.clearTimeout(pendingTimer.current);
            pendingTimer.current = null;
          }
          setDoc({ text: message.text, version: message.version });
          return;
        case 'setMode':
          setMode(message.mode);
          return;
        case 'toggleStructure':
          editor.current?.alternarEstrutura();
          return;
        case 'command': {
          const handle = editor.current;
          if (!handle) return;
          const map: Record<typeof message.command, ComandoDaBarra | 'undo' | 'redo'> = {
            undo: 'undo',
            redo: 'redo',
            bold: 'marca:negrito',
            italic: 'marca:italico',
            monospace: 'marca:mono',
            find: 'busca',
          };
          const command = map[message.command];
          if (command === 'undo') handle.desfazer();
          else if (command === 'redo') handle.refazer();
          else handle.executar(command);
          return;
        }
        case 'revealLine':
          setRevealLine(message.line);
          if (view === 'editor') editor.current?.irParaLinha(message.line);
          return;
        case 'setLocale':
          setLocale(message.locale);
          return;
        default:
          return;
      }
    };
    window.addEventListener('message', onMessage);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [view]);

  // Flush pending edits when the webview is hidden or unloaded.
  useEffect(() => {
    const onHide = (): void => flushEdit();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onHide);
    };
  }, [flushEdit]);

  const onChange = useCallback(
    (text: string) => {
      setDoc((d) => (d.text === text ? d : { text, version: d.version }));
      pendingEdit.current = text;
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
      pendingTimer.current = window.setTimeout(flushEdit, EDIT_DEBOUNCE_MS);
    },
    [flushEdit],
  );

  const onModeChange = useCallback((engineMode: ModoDoEditor) => {
    const next = MODE_FROM_ENGINE[engineMode];
    setMode(next);
    send({ type: 'modeChanged', mode: next });
    saveState({ mode: next });
  }, []);

  const onStructureChange = useCallback((open: boolean) => {
    setStructureOpen(open);
    send({ type: 'state', state: { structureOpen: open } });
    saveState({ structureOpen: open });
  }, []);

  const documentDirUri = init?.documentDirUri ?? '';
  const allowRemote = init?.allowRemoteImages ?? true;
  const imagesDir = useMemo(() => imagesDirOf(doc.text), [doc.text]);

  const resolveResource = useCallback(
    (target: string, kind: TipoDeRecurso): string => {
      if (isRemoteTarget(target)) return allowRemote ? target : '';
      if (isAbsoluteFsPath(target)) return ''; // absolute paths are outside the webview roots — the host cannot serve them
      if (!documentDirUri) return '';
      const dir = kind === 'imagem' || kind === 'video' || kind === 'audio' ? imagesDir : '';
      const cleaned = target.replace(/\{docdir\}/g, '.');
      return dir && !isAbsoluteFsPath(dir) ? joinUrl(documentDirUri, dir, cleaned) : joinUrl(documentDirUri, cleaned);
    },
    [allowRemote, documentDirUri, imagesDir],
  );

  const openReference = useCallback((target: string, kind: TipoDeRecurso) => {
    send({ type: 'openResource', kind: RESOURCE_KIND[kind], target });
  }, []);

  const storage = useMemo(
    () => ({
      ler: (key: string): string | null => {
        const state = readState() as Record<string, unknown>;
        const value = state[key];
        return typeof value === 'string' ? value : null;
      },
      gravar: (key: string, value: string): void => saveState({ [key]: value } as never),
    }),
    [],
  );

  if (!init) return <div className="tad-message">{t('loading')}</div>;

  return (
    <ErrorBoundary t={t}>
      <div className="tad-shell">
        {view === 'editor' ? (
          <XEditorAsciiDoc
            ref={editor}
            valor={doc.text}
            aoMudar={onChange}
            modo={MODE_TO_ENGINE[mode]}
            aoMudarModo={onModeChange}
            somenteLeitura={init.readOnly}
            estruturaAberta={structureOpen}
            aoMudarEstrutura={onStructureChange}
            textos={engineTexts(locale)}
            resolverRecurso={resolveResource}
            aoAcionarReferencia={openReference}
            armazenamento={storage}
            rotuloAcessivel={init.fileName}
          />
        ) : (
          <PreviewView text={doc.text} locale={locale} fileName={init.fileName} revealLine={revealLine} resolveResource={resolveResource} openReference={openReference} t={t} />
        )}
      </div>
    </ErrorBoundary>
  );
}

interface ErrorBoundaryProps {
  t: Translator;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** A render failure is reported, never swallowed: the message names what failed and how to recover. */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    send({ type: 'log', level: 'error', message: `${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}` });
  }

  render(): ReactNode {
    if (this.state.error)
      return (
        <div className="tad-message tad-message-erro" role="alert">
          <h2>{this.props.t('errorTitle')}</h2>
          <p>{this.props.t('errorBody', this.state.error.message)}</p>
        </div>
      );
    return this.props.children;
  }
}
