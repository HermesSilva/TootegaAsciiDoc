// Ambient declarations for the webview bundle.
// - CSS side-effect imports are handled by esbuild (loader 'empty') and the Tailwind CLI; TypeScript only needs to
//   accept them.
// - The engine reads `import.meta.env` in a few Vite-era modules that the type graph reaches but the bundle never
//   executes in the webview; the shape below keeps the type-check honest without pulling Vite's types.
declare module '*.css';

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
