import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startThemeBridge } from './themeBridge';
import type { LocaleId, ViewKind } from '../../shared/protocol';
import './styles.css';

declare global {
  interface Window {
    __TOOTEGA_BOOT__?: { view: ViewKind; locale: LocaleId };
  }
}

const boot = window.__TOOTEGA_BOOT__ ?? { view: 'editor' as ViewKind, locale: 'en' as LocaleId };
startThemeBridge();

const container = document.getElementById('root');
if (container) createRoot(container).render(<App view={boot.view} initialLocale={boot.locale} />);
