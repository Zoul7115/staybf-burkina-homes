// ============================================================
// Request tracing — correlation IDs across the full lifecycle
//
// Each financial operation (payment, booking, ledger write) carries
// a trace_id that links all related log entries, events, and DB rows.
// ============================================================

export type Span = {
  traceId:   string;
  spanId:    string;
  parentId:  string | null;
  name:      string;
  startedAt: string;
  endedAt:   string | null;
  durationMs: number | null;
  tags:      Record<string, string | number | boolean>;
  status:    "active" | "ok" | "error";
  error?:    string;
};

export type Trace = {
  traceId: string;
  spans:   Span[];
};

// In-process span registry — cleared between transactions
const activeTraces = new Map<string, Span[]>();

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function startTrace(name: string, tags: Record<string, string | number | boolean> = {}): Span {
  const traceId = crypto.randomUUID();
  const span: Span = {
    traceId,
    spanId:     shortId(),
    parentId:   null,
    name,
    startedAt:  new Date().toISOString(),
    endedAt:    null,
    durationMs: null,
    tags,
    status:     "active",
  };
  activeTraces.set(traceId, [span]);
  return span;
}

export function startSpan(parent: Span, name: string, tags: Record<string, string | number | boolean> = {}): Span {
  const span: Span = {
    traceId:    parent.traceId,
    spanId:     shortId(),
    parentId:   parent.spanId,
    name,
    startedAt:  new Date().toISOString(),
    endedAt:    null,
    durationMs: null,
    tags,
    status:     "active",
  };
  const spans = activeTraces.get(parent.traceId) ?? [];
  spans.push(span);
  activeTraces.set(parent.traceId, spans);
  return span;
}

export function endSpan(span: Span, status: "ok" | "error" = "ok", error?: string): void {
  const now = new Date().toISOString();
  const startMs = new Date(span.startedAt).getTime();
  span.endedAt    = now;
  span.durationMs = Date.now() - startMs;
  span.status     = status;
  if (error) span.error = error;
}

export function getTrace(traceId: string): Trace | null {
  const spans = activeTraces.get(traceId);
  if (!spans) return null;
  return { traceId, spans };
}

export function clearTrace(traceId: string): void {
  activeTraces.delete(traceId);
}

// Utility: trace an async operation, auto-end on resolve/reject
export async function traced<T>(
  parent: Span,
  name: string,
  fn: (span: Span) => Promise<T>,
  tags?: Record<string, string | number | boolean>
): Promise<T> {
  const span = startSpan(parent, name, tags);
  try {
    const result = await fn(span);
    endSpan(span, "ok");
    return result;
  } catch (e) {
    endSpan(span, "error", (e as Error).message);
    throw e;
  }
}
