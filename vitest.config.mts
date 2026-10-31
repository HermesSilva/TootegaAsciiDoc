import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

// Host unit tests (pure logic, without the VS Code API). The webview and the Electron integration are
// outside this runner. `vscode` is pointed at a stub (node does not have the editor runtime); `@core` reaches the
// editor engine's pure modules (parser) exactly as esbuild does.
export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'test/vscode-stub.ts'),
      '@core': path.resolve(__dirname, 'TootegaWebUI/src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
