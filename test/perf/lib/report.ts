// One JSON per suite while the run goes; lib/globalSetup.ts merges them into report.md and a dated copy.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { measure, type MeasureOptions, type Stats } from './measure';

export const RESULTS_DIR = path.resolve(__dirname, '..', 'results');

export interface Row extends Stats {
  group: string;
  scenario: string;
  /** Free-form columns: throughput, retained heap, growth exponent. */
  extra?: Record<string, string | number>;
}

export interface SuiteResult {
  suite: string;
  title: string;
  notes: string[];
  rows: Row[];
}

function ms(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function renderRows(rows: Row[]): string {
  const lines: string[] = [];
  const groups = [...new Set(rows.map((row) => row.group))];
  for (const group of groups) {
    const inGroup = rows.filter((row) => row.group === group);
    const extras = [...new Set(inGroup.flatMap((row) => Object.keys(row.extra ?? {})))];
    lines.push(`### ${group}`, '');
    lines.push(`| Scenario | n | Median ms | p95 ms | p99 ms | Max ms |${extras.map((extra) => ` ${extra} |`).join('')}`);
    lines.push(`|---|--:|--:|--:|--:|--:|${extras.map(() => '--:|').join('')}`);
    for (const row of inGroup) {
      const cells = extras.map((extra) => ` ${row.extra?.[extra] ?? ''} |`).join('');
      lines.push(`| ${row.scenario} | ${row.samples} | ${ms(row.median)} | ${ms(row.p95)} | ${ms(row.p99)} | ${ms(row.max)} |${cells}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export class Suite {
  private readonly result: SuiteResult;

  constructor(suite: string, title: string) {
    this.result = { suite, title, notes: [], rows: [] };
  }

  note(text: string): void {
    this.result.notes.push(text);
  }

  record(group: string, scenario: string, stats: Stats, extra?: Row['extra']): void {
    this.result.rows.push({ group, scenario, ...stats, extra });
  }

  time<T>(group: string, scenario: string, run: (input: T) => unknown, options?: MeasureOptions<T>, extra?: (stats: Stats) => Row['extra']): Stats {
    const stats = measure(run, options);
    this.record(group, scenario, stats, extra?.(stats));
    return stats;
  }

  flush(): void {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTS_DIR, `suite-${this.result.suite}.json`), JSON.stringify(this.result, null, 2), 'utf8');
    process.stdout.write(`\n## ${this.result.title}\n\n${renderRows(this.result.rows)}\n`);
  }
}
