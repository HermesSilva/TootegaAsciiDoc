// Timing primitives. Everything is in milliseconds, from `performance.now()`.

export interface Stats {
  samples: number;
  min: number;
  median: number;
  mean: number;
  p95: number;
  p99: number;
  max: number;
}

export interface MeasureOptions<T> {
  /** Built before each sample, outside the timed region. */
  prepare?: () => T;
  /** Runs discarded before sampling, so the first samples do not measure the JIT warming up. */
  warmup?: number;
  minSamples?: number;
  maxSamples?: number;
  /** Stop sampling after this long, once `minSamples` were taken. */
  budgetMs?: number;
}

let sink: unknown;

/** Keeps a result alive so the optimizer cannot remove the work that produced it. */
export function consume(value: unknown): void {
  sink = value;
}

export function lastConsumed(): unknown {
  return sink;
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

export function statsOf(values: number[]): Stats {
  if (values.length === 0) throw new Error('statsOf: no samples were taken');
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    min: sorted[0],
    median: percentile(sorted, 0.5),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

export function measure<T>(run: (input: T) => unknown, options: MeasureOptions<T> = {}): Stats {
  const { prepare, warmup = 3, minSamples = 10, maxSamples = 2000, budgetMs = 1500 } = options;
  for (let i = 0; i < warmup; i++) consume(run((prepare ? prepare() : undefined) as T));
  const values: number[] = [];
  const started = performance.now();
  while (values.length < maxSamples && (values.length < minSamples || performance.now() - started < budgetMs)) {
    const input = (prepare ? prepare() : undefined) as T;
    const t0 = performance.now();
    const result = run(input);
    values.push(performance.now() - t0);
    consume(result);
  }
  return statsOf(values);
}

/** Times the named stages of a repeated flow (one keystroke) and adds a TOTAL per round. */
export class Stages {
  private readonly values = new Map<string, number[]>();
  private round = 0;
  private recording = true;

  /** Rounds played while paused run the same code but leave no samples (JIT warm-up). */
  setRecording(recording: boolean): void {
    this.recording = recording;
    this.round = 0;
  }

  time<R>(name: string, run: () => R): R {
    const t0 = performance.now();
    const result = run();
    this.add(name, performance.now() - t0);
    return result;
  }

  add(name: string, ms: number): void {
    this.round += ms;
    if (!this.recording) return;
    const list = this.values.get(name);
    if (list) list.push(ms);
    else this.values.set(name, [ms]);
  }

  endRound(): void {
    const total = this.round;
    this.round = 0;
    if (!this.recording) return;
    const list = this.values.get('TOTAL');
    if (list) list.push(total);
    else this.values.set('TOTAL', [total]);
  }

  /** The stages in first-seen order, with TOTAL last. */
  results(): [string, Stats][] {
    const names = [...this.values.keys()].filter((name) => name !== 'TOTAL');
    if (this.values.has('TOTAL')) names.push('TOTAL');
    return names.map((name) => [name, statsOf(this.values.get(name) as number[])]);
  }
}

/** Heap kept alive by what `build` returns, after a full collection. Null without `--expose-gc`. */
export function retainedHeapMB(build: () => unknown): number | null {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) return null;
  gc();
  const before = process.memoryUsage().heapUsed;
  const kept = build();
  gc();
  const after = process.memoryUsage().heapUsed;
  consume(kept);
  return (after - before) / (1024 * 1024);
}

/**
 * Growth exponent from a size/time series (least squares on log-log): about 1 is linear, about 2 is quadratic.
 * Null when there are fewer than two usable points.
 */
export function growthExponent(points: { size: number; ms: number }[]): number | null {
  const usable = points.filter((point) => point.ms > 0 && point.size > 0);
  if (usable.length < 2) return null;
  const xs = usable.map((point) => Math.log(point.size));
  const ys = usable.map((point) => Math.log(point.ms));
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < xs.length; i++) {
    top += (xs[i] - meanX) * (ys[i] - meanY);
    bottom += (xs[i] - meanX) ** 2;
  }
  return bottom === 0 ? null : top / bottom;
}
