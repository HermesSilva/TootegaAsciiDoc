// The real webview: `App` from webview/src, booted by an `init` message like the host does, with production React.
// Keys are delivered as DOM events and committed with flushSync, so each sample is the whole synchronous cost of a
// key in TypeScript and React. The debounced work is timed too: the timers with the editor's delays run wrapped.
//
// What jsdom cannot show: there is no layout and no paint, and its DOM is not the browser's DOM. These numbers are
// the script cost of a key, not the time until the pixels change, and are good for comparing sizes, modes and versions.
//
// jsdom comes from TootegaWebUI/node_modules (a devDependency of the engine): nothing was added to this package.
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { populateGlobal } from 'vitest/runtime';
import { RENDER_COPIES, proseOffset, sizedDocument, TYPED_TEXT, type SizedDocument } from './lib/corpus';
import { measure, statsOf } from './lib/measure';
import { Suite } from './lib/report';

const suite = new Suite('webview', 'Real webview: App, production React, jsdom');
suite.note('jsdom has no layout and no paint: this is the script cost of a key, not the time until the pixels change. A 60 Hz frame is 16.7 ms.');
suite.note('"Key, committed" is the input event plus the keyup that follows it, each committed synchronously: what blocks the first paint. "Key, until idle" adds the state updates that effects schedule for later, which still occupy the thread before the next key. "Idle check" is what the wait itself costs when there is no work.');
suite.note('Debounced tasks are the timers of 120 ms (send to the host), 150 ms (visual emission) and 200 ms (code reparse), until idle. A sample count far above 3 means the keys were slower than the delays, so the timers fired between keys and "Key, until idle" includes them.');
suite.note('The visual view looks the caret paragraph up with querySelector on each key, and that scan stops at the match: the "DOM lookup" group shows its cost under jsdom, which explains why the last paragraph costs more than the first here. It is mostly a jsdom cost: on this same DOM with 76,516 elements, the lookup of the last paragraph took about 0.21 ms in headless Chrome (measured once, 2026-11-02). Read the first paragraph rows as the closer estimate of a key in the visual view.');

const engineModules = path.resolve(__dirname, '..', '..', 'TootegaWebUI', 'node_modules');
const hasJsdom = fs.existsSync(path.join(engineModules, 'jsdom', 'package.json'));

const DEBOUNCES = new Set([120, 150, 200]);
const BURST_KEYS = 25;
const ROUNDS = 4; // The first round warms the JIT and leaves no samples.
const KEY_GAP_MS = 20;
const PAUSE_MS = 500;

type EditorMode = 'visual' | 'code' | 'split';
type PostedMessage = { type: string; text?: string };

interface Runtime {
  createElement: typeof import('react').createElement;
  flushSync: typeof import('react-dom').flushSync;
  createRoot: typeof import('react-dom/client').createRoot;
  App: typeof import('../../webview/src/App').App;
}

let runtime: Runtime;
const posted: PostedMessage[] = [];
const debouncedTasks = new Map<number, number[]>();
let taskQueue: Promise<void> = Promise.resolve();
const realSetTimeout = globalThis.setTimeout;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => realSetTimeout(resolve, ms));

/**
 * Lets the work React scheduled for later run: a setState inside a passive effect escapes flushSync and goes through
 * the scheduler, which uses setImmediate under Node. Several turns, because that work can schedule more.
 */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn++) await new Promise<void>((resolve) => setImmediate(resolve));
}

function installDom(): void {
  const { JSDOM } = createRequire(path.join(engineModules, 'jsdom', 'package.json'))('jsdom') as typeof import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
  populateGlobal(globalThis, dom.window as unknown as Record<string, unknown>, { bindFunctions: true });

  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.ResizeObserver = StubResizeObserver;
  // The code editor sizes its window from this: 44 lines of 22 px, the viewport the pure suite assumes as well.
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 970 });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  let state: unknown;
  globals.acquireVsCodeApi = () => ({
    postMessage: (message: PostedMessage) => posted.push(message),
    getState: () => state,
    setState: (next: unknown) => {
      state = next;
    },
  });
}

function wrapDebounceTimers(): void {
  const wrapped = (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): unknown => {
    if (delay === undefined || !DEBOUNCES.has(delay)) return realSetTimeout(callback, delay, ...args);
    return realSetTimeout(() => {
      // In a queue: two timers due at once (a key slower than the delays) would otherwise time each other's work.
      taskQueue = taskQueue.then(async () => {
        const t0 = performance.now();
        runtime.flushSync(() => callback(...args));
        await settle();
        const elapsed = performance.now() - t0;
        const list = debouncedTasks.get(delay);
        if (list) list.push(elapsed);
        else debouncedTasks.set(delay, [elapsed]);
      });
    }, delay);
  };
  (globalThis as unknown as { setTimeout: unknown }).setTimeout = wrapped;
}

/** `act` exists only in the development build of React. */
function isProductionReact(react: typeof import('react')): boolean {
  return (react as unknown as { act?: unknown }).act === undefined;
}

class Editor {
  readonly container: HTMLDivElement;
  private readonly root: ReturnType<Runtime['createRoot']>;
  mountMs = 0;

  private constructor() {
    this.container = document.createElement('div');
    document.body.append(this.container);
    this.root = runtime.createRoot(this.container);
  }

  static async open(doc: SizedDocument, mode: EditorMode): Promise<Editor> {
    posted.length = 0;
    const editor = new Editor();
    runtime.flushSync(() => editor.root.render(runtime.createElement(runtime.App, { view: 'editor', initialLocale: 'pt-BR' })));
    await settle();
    if (!posted.some((message) => message.type === 'ready')) throw new Error('The webview App did not announce itself: its effects did not run.');
    editor.mountMs = await editor.deliver({
      type: 'init', view: 'editor', text: doc.text, version: 1, uri: 'file:///perf.adoc', fileName: 'perf.adoc', documentDirUri: 'http://localhost/',
      locale: 'pt-BR', mode, readOnly: false, structureOpen: false, allowRemoteImages: false,
    });
    return editor;
  }

  /** A message from the host, timed until the editor is idle. */
  async deliver(message: unknown): Promise<number> {
    const t0 = performance.now();
    runtime.flushSync(() => window.dispatchEvent(new MessageEvent('message', { data: message })));
    await settle();
    return performance.now() - t0;
  }

  textarea(): HTMLTextAreaElement {
    const area = this.container.querySelector<HTMLTextAreaElement>('textarea.adc-codigo-textarea');
    if (!area) throw new Error('The code editor textarea is not on screen.');
    return area;
  }

  /** Scrolls the code editor so the windowed render shows this line, as a real scroll would. */
  async scrollCodeTo(line: number): Promise<void> {
    const scroller = this.container.querySelector<HTMLElement>('.adc-codigo-rolagem');
    if (!scroller) throw new Error('The code editor scroller is not on screen.');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: Math.max(0, line * 22 - 485) });
    scroller.dispatchEvent(new Event('scroll'));
    await sleep(40);
  }

  /** One key in the code editor: the input event the browser fires after editing the value, then the keyup. */
  keyInCode(key: string): number {
    const area = this.textarea();
    const cursor = area.selectionStart;
    const next = area.value.slice(0, cursor) + key + area.value.slice(area.selectionEnd);
    (Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') as PropertyDescriptor).set?.call(area, next);
    area.setSelectionRange(cursor + key.length, cursor + key.length);
    const t0 = performance.now();
    runtime.flushSync(() => area.dispatchEvent(new Event('input', { bubbles: true })));
    runtime.flushSync(() => area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })));
    return performance.now() - t0;
  }

  /** The paragraph leaves on screen that hold text. */
  paragraphs(): HTMLElement[] {
    return [...this.container.querySelectorAll<HTMLElement>('p[data-folha]')].filter((element) => (element.textContent ?? '').length > 20);
  }

  /** One key in the visual view: the beforeinput the browser fires, with the caret at the end of the leaf. */
  keyInVisual(leafId: string, key: string): number {
    const leaf = this.container.querySelector<HTMLElement>(`[data-folha="${leafId}"]`);
    if (!leaf) throw new Error(`The paragraph ${leafId} left the screen.`);
    const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) lastText = node;
    if (!lastText) throw new Error(`The paragraph ${leafId} has no text node.`);
    (window.getSelection() as Selection).collapse(lastText, (lastText as Text).length);
    const t0 = performance.now();
    runtime.flushSync(() => leaf.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: key })));
    // The browser reports the caret that moved; the view listens to this.
    runtime.flushSync(() => document.dispatchEvent(new Event('selectionchange')));
    runtime.flushSync(() => leaf.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })));
    return performance.now() - t0;
  }

  lastEditSent(): string {
    for (let i = posted.length - 1; i >= 0; i--) if (posted[i].type === 'edit') return posted[i].text as string;
    throw new Error('No edit reached the host: the keys did not change the document.');
  }

  dispose(): void {
    runtime.flushSync(() => this.root.unmount());
    this.container.remove();
  }
}

/** Plays the bursts and records the key latency and the debounced tasks. Proves the text reached the host. */
async function playBursts(group: string, scenario: string, key: (character: string) => number, editor: Editor): Promise<void> {
  const committed: number[] = [];
  const untilIdle: number[] = [];
  debouncedTasks.clear();
  for (let round = 0; round < ROUNDS; round++) {
    const burst = TYPED_TEXT.slice(round * BURST_KEYS, (round + 1) * BURST_KEYS);
    for (const character of burst) {
      const t0 = performance.now();
      const elapsed = key(character);
      await settle();
      const total = performance.now() - t0;
      if (round > 0) {
        committed.push(elapsed);
        untilIdle.push(total);
      }
      await sleep(KEY_GAP_MS);
    }
    await sleep(PAUSE_MS);
    expect(editor.lastEditSent()).toContain(burst);
    if (round === 0) debouncedTasks.clear();
  }
  suite.record(`${group}: key, committed`, scenario, statsOf(committed));
  suite.record(`${group}: key, until idle`, scenario, statsOf(untilIdle));
  for (const [delay, values] of [...debouncedTasks.entries()].sort((a, b) => a[0] - b[0]))
    suite.record(`${group}: debounced task of ${delay} ms`, scenario, statsOf(values));
}

describe.skipIf(!hasJsdom)('webview', () => {
  beforeAll(async () => {
    installDom();
    const [react, reactDom, reactDomClient, app] = await Promise.all([import('react'), import('react-dom'), import('react-dom/client'), import('../../webview/src/App')]);
    runtime = { createElement: react.createElement, flushSync: reactDom.flushSync, createRoot: reactDomClient.createRoot, App: app.App };
    expect(process.env.NODE_ENV).toBe('production');
    expect(isProductionReact(react)).toBe(true);
    wrapDebounceTimers();
  });
  afterAll(() => suite.flush());

  it('idle check', async () => {
    const values: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      await settle();
      values.push(performance.now() - t0);
    }
    suite.record('Idle check: the wait with no work to do', '4 scheduler turns', statsOf(values));
  });

  for (const copies of RENDER_COPIES) {
    const doc = sizedDocument(copies);

    describe(doc.label, () => {
      it('opening, by mode', async () => {
        for (const mode of ['visual', 'code', 'split'] as const) {
          const samples: number[] = [];
          for (let i = 0; i < 4; i++) {
            const editor = await Editor.open(doc, mode);
            if (i > 0) samples.push(editor.mountMs);
            editor.dispose();
          }
          suite.record('Opening: init message to committed editor', `${doc.label}, ${mode}`, statsOf(samples));
        }
      });

      it('Visual mode, first paragraph', async () => {
        const editor = await Editor.open(doc, 'visual');
        const leaf = editor.paragraphs()[0].getAttribute('data-folha') as string;
        await playBursts('Visual', `${doc.label}, first paragraph`, (character) => editor.keyInVisual(leaf, character), editor);
        editor.dispose();
      });

      it('Visual mode, last paragraph', async () => {
        const editor = await Editor.open(doc, 'visual');
        const paragraphs = editor.paragraphs();
        const leaf = paragraphs.at(-1)?.getAttribute('data-folha') as string;
        const elements = editor.container.querySelectorAll('*').length;
        const lookups: [string, string][] = [['first paragraph', paragraphs[0].getAttribute('data-folha') as string], ['last paragraph', leaf]];
        for (const [where, id] of lookups) {
          const stats = measure(() => editor.container.querySelector(`[data-folha="${id}"]`), { warmup: 5, minSamples: 10, budgetMs: 300 });
          suite.record('DOM lookup: querySelector for the caret paragraph, under jsdom', `${doc.label}, ${where}`, stats, { Elements: elements });
        }
        await playBursts('Visual', `${doc.label}, last paragraph`, (character) => editor.keyInVisual(leaf, character), editor);
        editor.dispose();
      });

      for (const [where, fraction] of [['start', 0], ['end', 1]] as const)
        it(`Code mode, cursor at the ${where}`, async () => {
          const editor = await Editor.open(doc, 'code');
          const offset = proseOffset(doc.text, fraction);
          const area = editor.textarea();
          area.setSelectionRange(offset, offset);
          const line = doc.text.slice(0, offset).split('\n').length - 1;
          await editor.scrollCodeTo(line);
          expect(editor.container.querySelector('.adc-codigo-conteudo')?.textContent).toContain(String(line + 1));
          await playBursts('Code', `${doc.label}, cursor at the ${where}`, (character) => editor.keyInCode(character), editor);
          editor.dispose();
        });

      it('Split mode, typing on the code side', async () => {
        const editor = await Editor.open(doc, 'split');
        const offset = proseOffset(doc.text, 0);
        const area = editor.textarea();
        area.focus();
        area.setSelectionRange(offset, offset);
        await playBursts('Split', `${doc.label}, typing on the code side`, (character) => editor.keyInCode(character), editor);
        editor.dispose();
      });

      it('Split mode, typing on the visual side', async () => {
        const editor = await Editor.open(doc, 'split');
        const leaf = editor.paragraphs()[0].getAttribute('data-folha') as string;
        await playBursts('Split', `${doc.label}, typing on the visual side`, (character) => editor.keyInVisual(leaf, character), editor);
        editor.dispose();
      });

      it('switching modes and external changes', async () => {
        const editor = await Editor.open(doc, 'visual');
        const toCode: number[] = [];
        const toVisual: number[] = [];
        const external: number[] = [];
        for (let i = 0; i < 4; i++) {
          const code = await editor.deliver({ type: 'setMode', mode: 'code' });
          await sleep(50);
          const visual = await editor.deliver({ type: 'setMode', mode: 'visual' });
          await sleep(50);
          const update = await editor.deliver({ type: 'update', text: `${doc.text}\n\nAlteração externa ${i}.\n`, version: 2 + i });
          await sleep(50);
          if (i > 0) {
            toCode.push(code);
            toVisual.push(visual);
            external.push(update);
          }
        }
        suite.record('Mode switch: Visual to Code', doc.label, statsOf(toCode));
        suite.record('Mode switch: Code to Visual', doc.label, statsOf(toVisual));
        suite.record('External change: host update message, Visual mode', doc.label, statsOf(external));
        editor.dispose();
      });
    });
  }
});
