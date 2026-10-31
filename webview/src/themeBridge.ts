// Theme bridge: the editor engine paints with the design-system tokens of TootegaWebUI (HSL triples such as
// `--brand-surface: 0 0% 100%`), while VS Code exposes its theme as `--vscode-*` colours on <html>. This module
// reads the VS Code colours, converts them to the triples the engine expects and keeps them in sync when the
// theme changes — the engine's CSS stays untouched.

type Triple = string; // "h s% l%"

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
  transparent: { r: 0, g: 0, b: 0 },
};

export function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (NAMED[v]) return NAMED[v];
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6 || h.length === 8) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/.exec(v);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  const hsl = /^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(v);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  return null;
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) };
}

export function toTriple(rgb: Rgb): Triple {
  const { h, s, l } = rgbToHsl(rgb);
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Mixes `color` over `base` with the given weight (0..1 of `color`). */
export function mix(color: Rgb, base: Rgb, weight: number): Rgb {
  return {
    r: Math.round(color.r * weight + base.r * (1 - weight)),
    g: Math.round(color.g * weight + base.g * (1 - weight)),
    b: Math.round(color.b * weight + base.b * (1 - weight)),
  };
}

function shift(rgb: Rgb, deltaL: number): Rgb {
  const { h, s, l } = rgbToHsl(rgb);
  return hslToRgb(h, s, Math.max(0, Math.min(100, l + deltaL)));
}

export function isDarkTheme(): boolean {
  const cls = document.body.className;
  return /\bvscode-(dark|high-contrast)\b/.test(cls) && !/\bvscode-high-contrast-light\b/.test(cls);
}

function read(style: CSSStyleDeclaration, name: string, fallback: Rgb): Rgb {
  return parseColor(style.getPropertyValue(`--vscode-${name}`)) ?? fallback;
}

/** Applies the VS Code theme to the engine tokens. Call once and on every theme change. */
export function applyTheme(): void {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const dark = isDarkTheme();
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-device', 'desktop');

  const surface = read(style, 'editor-background', dark ? { r: 30, g: 30, b: 30 } : { r: 255, g: 255, b: 255 });
  const text = read(style, 'editor-foreground', dark ? { r: 212, g: 212, b: 212 } : { r: 30, g: 30, b: 30 });
  const background = read(style, 'sideBar-background', shift(surface, dark ? -3 : -4));
  const widget = read(style, 'editorWidget-background', shift(surface, dark ? 4 : -3));
  const border = read(style, 'widget-border', read(style, 'panel-border', mix(text, surface, 0.18)));
  const primary = read(style, 'focusBorder', read(style, 'button-background', { r: 0, g: 122, b: 204 }));
  const primaryDark = read(style, 'button-hoverBackground', shift(primary, -8));
  const primaryLight = read(style, 'textLink-foreground', shift(primary, 12));
  const secondary = read(style, 'descriptionForeground', mix(text, surface, 0.7));
  const muted = read(style, 'disabledForeground', mix(text, surface, 0.5));
  const hover = read(style, 'list-hoverBackground', mix(text, surface, 0.08));
  const active = read(style, 'toolbar-activeBackground', mix(text, surface, 0.14));
  const danger = read(style, 'errorForeground', { r: 244, g: 71, b: 71 });
  const warning = read(style, 'editorWarning-foreground', { r: 204, g: 167, b: 0 });
  const info = read(style, 'editorInfo-foreground', primary);
  const success = read(style, 'testing-iconPassed', read(style, 'terminal-ansiGreen', { r: 115, g: 201, b: 145 }));
  const popoverBorder = read(style, 'editorWidget-border', border);
  const scrollbar = style.getPropertyValue('--vscode-scrollbarSlider-background').trim();

  const set = (name: string, value: string): void => root.style.setProperty(name, value);
  set('--brand-surface', toTriple(surface));
  set('--brand-background', toTriple(background));
  set('--text-primary', toTriple(text));
  set('--text-secondary', toTriple(secondary));
  set('--text-muted', toTriple(muted));
  set('--border-color', toTriple(border));
  set('--border-light', toTriple(mix(border, surface, 0.5)));
  set('--brand-primary', toTriple(primary));
  set('--brand-primary-dark', toTriple(primaryDark));
  set('--brand-primary-light', toTriple(primaryLight));
  set('--popover-bg', toTriple(widget));
  set('--popover-border', toTriple(popoverBorder));
  set('--popover-footer-bg', toTriple(background));
  set('--hover', toTriple(hover));
  set('--active', toTriple(active));
  set('--muted-bg', toTriple(widget));
  set('--danger', toTriple(danger));
  set('--danger-bg', toTriple(mix(danger, surface, dark ? 0.22 : 0.12)));
  set('--warning', toTriple(warning));
  set('--warning-bg', toTriple(mix(warning, surface, dark ? 0.22 : 0.14)));
  set('--info', toTriple(info));
  set('--info-bg', toTriple(mix(info, surface, dark ? 0.22 : 0.12)));
  set('--success', toTriple(success));
  set('--success-bg', toTriple(mix(success, surface, dark ? 0.22 : 0.12)));
  if (scrollbar) set('--scrollbar-thumb', scrollbar);
  set('--hint-border', dark ? '0 0% 100%' : '0 0% 0%');
  set('--hint-inset', dark ? '0 0% 100%' : '0 0% 0%');
  set('--hint-border-alpha', dark ? '0.20' : '0.10');

  // Typography follows the editor: the engine declares rem-based sizes, so the root font size tracks VS Code.
  const fontSize = style.getPropertyValue('--vscode-editor-font-size').trim() || style.getPropertyValue('--vscode-font-size').trim();
  if (fontSize) root.style.fontSize = fontSize;
  const fontFamily = style.getPropertyValue('--vscode-font-family').trim();
  if (fontFamily) root.style.setProperty('--adc-fonte-ui', fontFamily);
  const codeFont = style.getPropertyValue('--vscode-editor-font-family').trim();
  if (codeFont) root.style.setProperty('--adc-fonte-codigo', codeFont);
}

/** Applies the theme now and whenever VS Code swaps the theme classes on <body>. Returns a disposer. */
export function startThemeBridge(): () => void {
  applyTheme();
  const observer = new MutationObserver(() => applyTheme());
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}
