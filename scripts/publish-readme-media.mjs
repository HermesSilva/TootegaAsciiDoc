// Publishes the README media (media/readme/*, media/icon.png) to the `assets` branch of the GitHub repository, so the
// Marketplace README — which can only show images from an HTTPS URL — never depends on a pull request being merged
// into master. The branch is written with git plumbing (no checkout, no switch) and holds exactly these files.
// Called by package-vsix.*; the package then uses --baseImagesUrl pointing at this branch.
// Usage: node scripts/publish-readme-media.mjs   (prints the base URL)
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = 'assets';
const FILES = ['media/icon.png', ...fs.readdirSync(path.join(root, 'media', 'readme')).map((f) => `media/readme/${f}`)];

const git = (args, input) => execFileSync('git', args, { cwd: root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const remote = git(['config', '--get', 'remote.origin.url']);
const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(remote);
if (!m) throw new Error(`origin is not a GitHub repository: ${remote}`);
const baseUrl = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${BRANCH}`;

// Tree: media/ { icon.png, readme/ {...} }
const blobs = FILES.map((f) => ({ path: f, hash: git(['hash-object', '-w', path.join(root, f)]) }));
const readmeTree = git(['mktree'], blobs.filter((b) => b.path.startsWith('media/readme/')).map((b) => `100644 blob ${b.hash}\t${path.basename(b.path)}\n`).join(''));
const icon = blobs.find((b) => b.path === 'media/icon.png');
const mediaTree = git(['mktree'], `100644 blob ${icon.hash}\ticon.png\n040000 tree ${readmeTree}\treadme\n`);
const rootTree = git(['mktree'], `040000 tree ${mediaTree}\tmedia\n`);

// Parent: the current assets head, if any (keeps the branch history; identical trees skip the commit).
let parent = null;
try {
  git(['fetch', '-q', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`]);
  parent = git(['rev-parse', `refs/remotes/origin/${BRANCH}`]);
} catch {
  parent = null;
}
if (parent && git(['rev-parse', `${parent}^{tree}`]) === rootTree) {
  console.log(`[assets] unchanged on origin/${BRANCH}; base URL ${baseUrl}`);
  process.stdout.write(baseUrl + '\n');
  process.exit(0);
}
const message = `README media for the Marketplace (${new Date().toISOString().slice(0, 10)})`;
const commit = git(['commit-tree', rootTree, ...(parent ? ['-p', parent] : []), '-m', message]);
git(['push', '-q', 'origin', `${commit}:refs/heads/${BRANCH}`]);
console.log(`[assets] pushed ${commit.slice(0, 7)} to origin/${BRANCH}: ${FILES.length} files; base URL ${baseUrl}`);
process.stdout.write(baseUrl + '\n');
