import { performance } from 'perf_hooks';

export type ProfilerCounterName = string;
export type ProfilerTimerName = string;

export interface Profiler {
	timeAsync<T>(name: ProfilerTimerName, fn: () => Promise<T>): Promise<T>;
	timeSync<T>(name: ProfilerTimerName, fn: () => T): T;
	count(name: ProfilerCounterName, delta?: number): void;
}

let activeProfiler: Profiler | null = null;

export function setActiveProfiler(profiler: Profiler | null): void {
	activeProfiler = profiler;
}

function getActiveProfiler(): Profiler | null {
	return activeProfiler;
}

export async function profiledAsync<T>(name: ProfilerTimerName, fn: () => Promise<T>): Promise<T> {
	const profiler = getActiveProfiler();
	if (!profiler) {
		return await fn();
	}
	return await profiler.timeAsync(name, fn);
}

export function profiledSync<T>(name: ProfilerTimerName, fn: () => T): T {
	const profiler = getActiveProfiler();
	if (!profiler) {
		return fn();
	}
	return profiler.timeSync(name, fn);
}

export function profiledCount(name: ProfilerCounterName, delta: number = 1): void {
	const profiler = getActiveProfiler();
	if (!profiler) return;
	profiler.count(name, delta);
}

export class AggregatingProfiler implements Profiler {
	private readonly timers = new Map<
		string,
		{
			count: number;
			totalMs: number;
			minMs: number;
			maxMs: number;
			samples: number[];
		}
	>();

	private readonly counters = new Map<string, number>();

	constructor(
		private readonly options: {
			sampleRate: number;
			maxSamplesPerTimer: number;
		} = { sampleRate: 0.05, maxSamplesPerTimer: 2000 }
	) {}

	timeSync<T>(name: string, fn: () => T): T {
		const start = performance.now();
		try {
			return fn();
		} finally {
			this.recordTimer(name, performance.now() - start);
		}
	}

	async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
		const start = performance.now();
		try {
			return await fn();
		} finally {
			this.recordTimer(name, performance.now() - start);
		}
	}

	count(name: string, delta: number = 1): void {
		this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
	}

	private recordTimer(name: string, durationMs: number): void {
		const stat =
			this.timers.get(name) ??
			(() => {
				const created = {
					count: 0,
					totalMs: 0,
					minMs: Number.POSITIVE_INFINITY,
					maxMs: 0,
					samples: [] as number[]
				};
				this.timers.set(name, created);
				return created;
			})();

		stat.count += 1;
		stat.totalMs += durationMs;
		stat.minMs = Math.min(stat.minMs, durationMs);
		stat.maxMs = Math.max(stat.maxMs, durationMs);

		if (
			this.options.sampleRate > 0 &&
			Math.random() < this.options.sampleRate &&
			stat.samples.length < this.options.maxSamplesPerTimer
		) {
			stat.samples.push(durationMs);
		}
	}

	getTimerStats(): Array<{
		name: string;
		count: number;
		totalMs: number;
		avgMs: number;
		minMs: number;
		p95Ms?: number;
		maxMs: number;
		sampleCount: number;
	}> {
		const out: Array<{
			name: string;
			count: number;
			totalMs: number;
			avgMs: number;
			minMs: number;
			p95Ms?: number;
			maxMs: number;
			sampleCount: number;
		}> = [];

		for (const [name, stat] of this.timers.entries()) {
			const avgMs = stat.count > 0 ? stat.totalMs / stat.count : 0;
			const p95Ms = stat.samples.length > 0 ? percentile(stat.samples, 0.95) : undefined;

			out.push({
				name,
				count: stat.count,
				totalMs: stat.totalMs,
				avgMs,
				minMs: Number.isFinite(stat.minMs) ? stat.minMs : 0,
				p95Ms,
				maxMs: stat.maxMs,
				sampleCount: stat.samples.length
			});
		}

		out.sort((a, b) => b.totalMs - a.totalMs);
		return out;
	}

	getCounters(): Record<string, number> {
		return Object.fromEntries(this.counters.entries());
	}
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
	return sorted[idx];
}
