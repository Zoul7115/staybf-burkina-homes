// ============================================================
// Structured logger for Edge Functions
//
// Every request produces a JSON log line with:
//   request_id, function_name, user_id, booking_id,
//   payment_id, duration_ms, result, error (if any)
//
// Usage:
//   const log = createLogger("process-payment-webhook", requestId);
//   log.info("webhook received", { provider, providerEventId });
//   log.error("ledger write failed", error);
//   log.end("processed", { bookingId, paymentId });
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  request_id?: string;
  function_name?: string;
  user_id?: string;
  booking_id?: string;
  payment_id?: string;
  webhook_log_id?: string;
  [key: string]: unknown;
};

export type LogEntry = LogContext & {
  level: LogLevel;
  message: string;
  timestamp: string;
  duration_ms?: number;
};

export type Logger = {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, error?: unknown, extra?: Record<string, unknown>): void;
  end(result: "ok" | "error" | "skipped" | "deduplicated", extra?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
};

function formatError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, name: error.name };
  }
  return { raw: String(error) };
}

export function createLogger(functionName: string, requestId: string, baseCtx: LogContext = {}): Logger {
  const startMs = Date.now();
  const ctx: LogContext = { request_id: requestId, function_name: functionName, ...baseCtx };

  function emit(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...ctx,
      ...extra,
    };
    // Deno: console.log goes to structured logging in Supabase
    console.log(JSON.stringify(entry));
  }

  return {
    debug(message, extra) { emit("debug", message, extra); },
    info(message, extra)  { emit("info",  message, extra); },
    warn(message, extra)  { emit("warn",  message, extra); },
    error(message, error, extra) {
      emit("error", message, { ...extra, error: formatError(error) });
    },
    end(result, extra) {
      emit("info", `[END] ${result}`, {
        ...extra,
        result,
        duration_ms: Date.now() - startMs,
      });
    },
    child(extra: Record<string, unknown>): Logger {
      return createLogger(functionName, requestId, { ...ctx, ...extra });
    },
  };
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}
