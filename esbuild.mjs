// Build pipeline — host (Node, inside VS Code) and webview (React, browser).
// Usage: node esbuild.mjs [--watch] [--production]
//
// Three outputs:
//   dist/extension.js      the extension host (cjs; 'vscode' is provided by the host)
//   dist/webview/main.js   the webview bundle (iife, React 19)
//   dist/webview/main.css  the stylesheet — Tailwind v4 CLI over webview/src/styles.css, which imports the
//                          engine's design system (TootegaWebUI/src/styles/index.css) and the editor CSS.
//                          esbuild therefore treats CSS imports as empty: one stylesheet, one source of truth.
//
// The editor engine is NOT an npm dependency: it is the sibling checkout TootegaWebUI/ (its own repository),
// reached through the '@core' alias. TootegaWebUI has its own node_modules, so react, react-dom and lucide-react
// are pinned to THIS package's copies — a second React in the bundle breaks every hook.
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const engineSrc = path.join(root, 'TootegaWebUI', 'src');
if (!fs.existsSync(path.join(engineSrc, 'components', 'asciidoc', 'index.ts'))) {
  console.error(
    `[esbuild] the editor engine was not found at ${engineSrc}.\n` +
      '          Check out github.com/Tootega/TootegaWebUI into ./TootegaWebUI (see README.md).',
  );
  process.exit(1);
}

const own = (pkg) => path.dirname(require.resolve(`${pkg}/package.json`));

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
};

// 1) Extension host (+ the export worker, a separate worker_threads entry). The host also reaches the engine's
//    pure parser (diagnostics, symbols) through the same '@core' alias.
const hostCtx = await esbuild.context({
  ...common,
  entryPoints: { extension: 'src/extension.ts', 'export-worker': 'src/export/worker.ts' },
  outdir: 'dist',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  alias: { '@core': engineSrc },
});

// 2) Webview.
const webCtx = await esbuild.context({
  ...common,
  entryPoints: ['webview/src/main.tsx'],
  outfile: 'dist/webview/main.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  alias: {
    '@core': engineSrc,
    react: own('react'),
    'react-dom': own('react-dom'),
    'lucide-react': own('lucide-react'),
  },
});

// 3) Stylesheet (Tailwind v4 CLI).
function tailwind() {
  const cliPkg = require('@tailwindcss/cli/package.json');
  const bin = path.join(own('@tailwindcss/cli'), typeof cliPkg.bin === 'string' ? cliPkg.bin : cliPkg.bin.tailwindcss);
  const args = [bin, '-i', 'webview/src/styles.css', '-o', 'dist/webview/main.css'];
  if (production) args.push('--minify');
  if (watch) args.push('--watch');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    if (watch) {
      resolve(child);
      return;
    }
    child.on('exit', (code) => (code === 0 ? resolve(child) : reject(new Error(`tailwindcss exited with code ${code}`))));
  });
}

fs.mkdirSync(path.join(root, 'dist', 'webview'), { recursive: true });

// 4) The AsciiDocConverter WebAssembly module (export). Built in the AsciiDocConverter repository
//    (build-wasm.sh → Dist/AsciiDocConverter.wasm); copied into dist/ so the VSIX carries it. Its absence does not
//    break the build — the export command reports it at runtime, by name — but it is announced here.
function copyWasm() {
  const candidates = [
    process.env.ASCIIDOCCONVERTER_ROOT && path.join(process.env.ASCIIDOCCONVERTER_ROOT, 'Dist', 'AsciiDocConverter.wasm'),
    path.join(root, 'wasm', 'AsciiDocConverter.wasm'),
    path.join(root, '..', 'AsciiDocConverter', 'Dist', 'AsciiDocConverter.wasm'),
  ].filter(Boolean);
  const source = candidates.find((p) => fs.existsSync(p));
  if (!source) {
    console.warn(`[esbuild] AsciiDocConverter.wasm not found (looked in ${candidates.join(', ')}); export will be unavailable at runtime.`);
    return;
  }
  fs.copyFileSync(source, path.join(root, 'dist', 'AsciiDocConverter.wasm'));
  console.log(`[esbuild] copied ${source}`);
}
copyWasm();

if (watch) {
  await Promise.all([hostCtx.watch(), webCtx.watch(), tailwind()]);
  console.log('[esbuild] watching…');
} else {
  await Promise.all([hostCtx.rebuild(), webCtx.rebuild(), tailwind()]);
  await Promise.all([hostCtx.dispose(), webCtx.dispose()]);
  console.log('[esbuild] build complete');
}
