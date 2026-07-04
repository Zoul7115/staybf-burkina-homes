// ============================================================
// Client-side structured logger
//
// In production: emits structured JSON to console (picked up by
// error reporting / observability platforms).
// In development: formats for human readability.
//
// All financial operations MUST produce a log entry with:
//   request_id, user_id, booking_id, payment_id,
//   duration_ms, result, error
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  request_id?: string;
  user_id?: string;
  booking_id?: string;
  payment_id?: string;
  host_id?: string;
  [key: string]: unknown;
};

export type LogEntry = LogContext & {
  level: LogLevel;
  message: string;
  timestamp: string;
  duration_ms?: number;
};

const IS_DEV = import.meta.env?.DEV ?? false;

function emit(level: LogLevel, message: string, ctx: LogContext, extra?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
    ...extra,
  };

  if (IS_DEV) {
    const prefix = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level];
    const parts = [prefix, message];
    const relevant = Object.entries(extra ?? {}).filter(([, v]) => v !== undefined);
    if (relevant.length) parts.push(`(${relevant.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})`);
    console[level === "debug" ? "debug" : level === "info" ? "log" : level](parts.join(" "));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export type Logger = {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, error?: unknown, extra?: Record<string, unknown>): void;
  timed<T>(label: string, fn: () => Promise<T>): Promise<T>;
  child(extra: LogContext): Logger;
};

function formatError(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined;
  if (err instanceof Error) return { message: err.message, name: err.name };
  return { raw: String(err) };
}

export function createLogger(ctx: LogContext = {}): Logger {
  return {
    debug(msg, extra) { emit("debug", msg, ctx, extra); },
    info(msg, extra)  { emit("info",  msg, ctx, extra); },
    warn(msg, extra)  { emit("warn",  msg, ctx, extra); },
    error(msg, error, extra) {
      emit("error", msg, ctx, { ...extra, error: formatError(error) });
    },
    async timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const t0 = performance.now();
      try {
        const result = await fn();
        emit("info", label, ctx, { duration_ms: Math.round(performance.now() - t0), result: "ok" });
        return result;
      } catch (e) {
        emit("error", label, ctx, { duration_ms: Math.round(performance.now() - t0), result: "error", error: formatError(e) });
        throw e;
      }
    },
    child(extra: LogContext): Logger {
      return createLogger({ ...ctx, ...extra });
    },
  };
}

// Global logger — use for top-level module logs
export const logger = createLogger();
