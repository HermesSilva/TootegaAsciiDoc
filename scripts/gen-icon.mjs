// Renders media/icon.png from media/icon.svg (the marketplace needs a PNG) and the sample figure of Docs/samples.
// Usage: node scripts/gen-icon.mjs
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function render(svgPath, pngPath, width) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, png);
  console.log(`${pngPath} (${png.length} bytes)`);
}

render(path.join(root, 'media', 'icon.svg'), path.join(root, 'media', 'icon.png'), 256);
render(path.join(root, 'Docs', 'samples', 'images', 'architecture.svg'), path.join(root, 'Docs', 'samples', 'images', 'architecture.png'), 640);
