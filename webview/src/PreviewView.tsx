// The side preview: the engine's WYSIWYG view, read-only, over the parsed text. Scroll sync works through the
// `data-linha` attributes the engine stamps on every block (source line → element): the host says which line to
// reveal, and the preview tells the host which line is at the top when the user scrolls. Double-click jumps to
// the source.
import { useEffect, useMemo, useRef, type JSX } from 'react';
import { XVistaWYSIWYG, analisarAsciiDoc, ContextoDeTextos, fundirTextos, type TipoDeRecurso } from '@core/components/asciidoc';
import type { LocaleId } from '../../shared/protocol';
import { engineTexts, type Translator } from './i18n';
import { send } from './vscodeApi';

export interface PreviewViewProps {
  text: string;
  locale: LocaleId;
  fileName: string;
  revealLine?: number;
  resolveResource: (target: string, kind: TipoDeRecurso) => string;
  openReference: (target: string, kind: TipoDeRecurso) => void;
  t: Translator;
}

const noop = (): void => undefined;

export function PreviewView({ text, locale, fileName, revealLine, resolveResource, openReference, t }: PreviewViewProps): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const suppressScroll = useRef(0);
  const analysis = useMemo(() => analisarAsciiDoc(text), [text]);
  const textos = useMemo(() => fundirTextos(engineTexts(locale)), [locale]);

  // Host asks to reveal a source line: scroll the nearest block (last block starting at or before the line).
  useEffect(() => {
    if (revealLine === undefined || !container.current) return;
    const target = elementForLine(container.current, revealLine);
    if (!target) return;
    suppressScroll.current = Date.now();
    const top = target.getBoundingClientRect().top - container.current.getBoundingClientRect().top + container.current.scrollTop;
    container.current.scrollTo({ top: Math.max(0, top - 8), behavior: 'auto' });
    for (const el of container.current.querySelectorAll('.tad-preview-selecao')) el.classList.remove('tad-preview-selecao');
    target.classList.add('tad-preview-selecao');
  }, [revealLine, analysis]);

  const onScroll = (): void => {
    if (!container.current) return;
    if (Date.now() - suppressScroll.current < 150) return; // our own programmatic scroll
    const line = lineAtTop(container.current);
    if (line !== undefined) send({ type: 'scrolled', line });
  };

  const onDoubleClick = (event: React.MouseEvent): void => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-linha]');
    const line = el ? Number(el.dataset.linha) : NaN;
    if (Number.isFinite(line) && line > 0) send({ type: 'goToSource', line });
  };

  const empty = text.trim() === '';

  return (
    <ContextoDeTextos.Provider value={textos}>
      <div ref={container} className="tad-preview" aria-label={t('previewOf', fileName)} onScroll={onScroll} onDoubleClick={onDoubleClick}>
        {empty ? (
          <div className="tad-message">{t('previewEmpty')}</div>
        ) : (
          <XVistaWYSIWYG
            documento={analysis.documento}
            selecao={null}
            somenteLeitura
            marcasPendentes={null}
            aoAplicar={noop}
            aoMudarSelecao={noop}
            aoDesfazer={noop}
            aoRefazer={noop}
            aoAlternarMarca={noop}
            aoPedirDialogo={noop}
            blocoSelecionado={null}
            aoSelecionarBloco={noop}
            resolverRecurso={resolveResource}
            aoAcionarReferencia={openReference}
          />
        )}
      </div>
    </ContextoDeTextos.Provider>
  );
}

function linedElements(root: HTMLElement): { line: number; el: HTMLElement }[] {
  const out: { line: number; el: HTMLElement }[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-linha]')) {
    const line = Number(el.dataset.linha);
    if (Number.isFinite(line) && line > 0) out.push({ line, el });
  }
  return out.sort((a, b) => a.line - b.line);
}

function elementForLine(root: HTMLElement, line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const item of linedElements(root)) {
    if (item.line <= line) best = item.el;
    else break;
  }
  return best;
}

function lineAtTop(root: HTMLElement): number | undefined {
  const rootTop = root.getBoundingClientRect().top;
  let best: number | undefined;
  for (const { line, el } of linedElements(root)) {
    const top = el.getBoundingClientRect().top - rootTop;
    if (top >= -2) return line;
    best = line;
  }
  return best;
}
