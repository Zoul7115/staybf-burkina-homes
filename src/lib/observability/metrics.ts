// ============================================================
// Client-side metrics — lightweight counters and timers
//
// Not a full APM solution — tracks in-process aggregates for:
//   - Payment funnel step completion rates
//   - Ledger write counts
//   - Edge Function call durations
//
// In production, flush metrics to your analytics backend
// (e.g. Supabase analytics_events, PostHog, Amplitude).
// ============================================================

export type MetricName =
  | "payment_intent_created"
  | "payment_captured"
  | "payment_failed"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_completed"
  | "ledger_write"
  | "refund_created"
  | "payout_created"
  | "webhook_received"
  | "webhook_deduplicated"
  | "edge_fn_call"
  | "edge_fn_error";

type Counter = { count: number; lastAt: string };
type Timer   = { count: number; totalMs: number; minMs: number; maxMs: number; lastAt: string };

const counters = new Map<string, Counter>();
const timers   = new Map<string, Timer>();

export function increment(name: MetricName, tags: Record<string, string> = {}): void {
  const key = metricKey(name, tags);
  const existing = counters.get(key) ?? { count: 0, lastAt: "" };
  counters.set(key, { count: existing.count + 1, lastAt: new Date().toISOString() });
}

export function recordDuration(name: MetricName, durationMs: number, tags: Record<string, string> = {}): void {
  const key = metricKey(name, tags);
  const existing = timers.get(key) ?? { count: 0, totalMs: 0, minMs: Infinity, maxMs: -Infinity, lastAt: "" };
  timers.set(key, {
    count: existing.count + 1,
    totalMs: existing.totalMs + durationMs,
    minMs: Math.min(existing.minMs, durationMs),
    maxMs: Math.max(existing.maxMs, durationMs),
    lastAt: new Date().toISOString(),
  });
}

export async function measure<T>(name: MetricName, fn: () => Promise<T>, tags: Record<string, string> = {}): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    recordDuration(name, Math.round(performance.now() - t0), { ...tags, result: "ok" });
    return result;
  } catch (e) {
    recordDuration(name, Math.round(performance.now() - t0), { ...tags, result: "error" });
    throw e;
  }
}

export function getSnapshot(): Record<string, Counter | Timer> {
  const snapshot: Record<string, Counter | Timer> = {};
  for (const [k, v] of counters.entries()) snapshot[`counter.${k}`] = v;
  for (const [k, v] of timers.entries())   snapshot[`timer.${k}`]   = v;
  return snapshot;
}

export function reset(): void {
  counters.clear();
  timers.clear();
}

function metricKey(name: string, tags: Record<string, string>): string {
  const tagStr = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return tagStr ? `${name}{${tagStr}}` : name;
}
