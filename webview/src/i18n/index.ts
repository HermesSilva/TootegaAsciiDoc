// The webview's i18n layer: the extension's own strings and the catalogue injected into the engine (`textos`).
// Runtime switching; interpolation with {0}, {1}…
import type { LocaleId } from '../../../shared/protocol';
import type { TextosDoEditorAsciiDoc } from '@core/components/asciidoc';
import { en, type Strings } from './en';
import { ptBR } from './pt-br';
import { engineTextsEn } from './engine-en';

const catalogs: Record<LocaleId, Partial<Strings>> = { en, 'pt-BR': ptBR };

export function normalizeLocale(raw: string | undefined): LocaleId {
  return raw && raw.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function createTranslator(locale: LocaleId) {
  const table = catalogs[locale];
  return function t(key: keyof Strings, ...args: (string | number)[]): string {
    let s: string = table[key] ?? en[key] ?? String(key);
    args.forEach((a, i) => {
      s = s.replace(new RegExp(`\\{${i}\\}`, 'g'), String(a));
    });
    return s;
  };
}

export type Translator = ReturnType<typeof createTranslator>;

/** The engine speaks pt-BR by default; for English the webview injects the full catalogue. */
export function engineTexts(locale: LocaleId): TextosDoEditorAsciiDoc | undefined {
  return locale === 'en' ? engineTextsEn : undefined;
}
