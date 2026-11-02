// Clears the per-suite files before a run and merges them into report.md and runs/<date>.json after it.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderRows, RESULTS_DIR, type SuiteResult } from './report';

function suiteFiles(): string[] {
  if (!fs.existsSync(RESULTS_DIR)) return [];
  return fs.readdirSync(RESULTS_DIR).filter((file) => /^suite-.*\.json$/.test(file));
}

function commit(dir: string): string {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (error) {
    return `unknown (${(error as Error).message.split('\n')[0]})`;
  }
}

export function setup(): () => void {
  for (const file of suiteFiles()) fs.rmSync(path.join(RESULTS_DIR, file));
  return () => {
    const suites: SuiteResult[] = suiteFiles().map((file) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8')) as SuiteResult);
    if (suites.length === 0) return;
    const root = path.resolve(RESULTS_DIR, '..', '..', '..');
    const date = new Date().toISOString();
    const machine = {
      date,
      node: process.version,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cores: os.cpus().length,
      platform: `${os.platform()} ${os.release()}`,
      extensionCommit: commit(root),
      engineCommit: commit(path.join(root, 'TootegaWebUI')),
    };
    const lines = [
      '# Performance report',
      '',
      `${machine.date} | ${machine.node} | ${machine.cpu} (${machine.cores} threads) | ${machine.platform}`,
      `extension ${machine.extensionCommit} | engine ${machine.engineCommit}`,
      '',
    ];
    for (const suite of suites) {
      lines.push(`## ${suite.title}`, '');
      for (const note of suite.notes) lines.push(`> ${note}`, '');
      lines.push(renderRows(suite.rows));
    }
    fs.writeFileSync(path.join(RESULTS_DIR, 'report.md'), lines.join('\n'), 'utf8');
    const runs = path.join(RESULTS_DIR, 'runs');
    fs.mkdirSync(runs, { recursive: true });
    fs.writeFileSync(path.join(runs, `${date.replace(/[:.]/g, '-')}.json`), JSON.stringify({ machine, suites }, null, 2), 'utf8');
    process.stdout.write(`\nReport: ${path.join(RESULTS_DIR, 'report.md')}\n`);
  };
}
