// Performance measurements. Separate from `vitest.config.mts` on purpose: `npm test` never runs these files.
//
//   npx vitest run --config test/perf/vitest.perf.config.mts            (everything)
//   npx vitest run --config test/perf/vitest.perf.config.mts parser     (one suite, by file name)
//
// Measures only: no suite fails on a time. Results go to test/perf/results/ (see lib/report.ts).
import { defineConfig, type Plugin } from 'vitest/config';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const own = (pkg: string): string => path.join(root, 'node_modules', pkg).replace(/\\/g, '/');

/**
 * The code editor's per-keystroke helpers are private to its module. Rather than copying them (a copy would drift
 * and measure something else), the suite re-exports them at transform time: the source on disk stays untouched.
 */
function exposeCodeEditorHelpers(): Plugin {
  return {
    name: 'perf-expose-code-editor-helpers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('XEditorDeCodigo.tsx')) return null;
      return { code: `${code}\nexport { linhaDaPosicao, parBalanceado, larguraVisual };\n`, map: null };
    },
  };
}

export default defineConfig({
  root,
  plugins: [exposeCodeEditorHelpers()],
  // The production JSX runtime, as the shipped bundle: the default here is the development one, absent from production React.
  oxc: { jsx: { runtime: 'automatic', development: false } },
  resolve: {
    alias: [
      { find: 'vscode', replacement: path.join(root, 'test', 'vscode-stub.ts') },
      { find: '@core', replacement: path.join(root, 'TootegaWebUI', 'src') },
      // One React only, the extension's, exactly as esbuild.mjs does: the engine has its own node_modules.
      { find: /^react-dom($|\/)/, replacement: `${own('react-dom')}$1` },
      { find: /^react($|\/)/, replacement: `${own('react')}$1` },
      { find: /^lucide-react$/, replacement: own('lucide-react') },
    ],
  },
  test: {
    include: ['test/perf/**/*.perf.ts'],
    environment: 'node',
    globalSetup: ['test/perf/lib/globalSetup.ts'],
    // Timings must not compete with each other: one suite at a time, each in a fresh process.
    pool: 'forks',
    fileParallelism: false,
    isolate: true,
    execArgv: ['--expose-gc'],
    // The shipped bundle uses production React; development React is many times slower and would measure the wrong thing.
    env: { NODE_ENV: 'production' },
    disableConsoleIntercept: true,
    testTimeout: 900_000,
    hookTimeout: 300_000,
  },
});
