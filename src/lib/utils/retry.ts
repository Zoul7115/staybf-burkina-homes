// ============================================================
// Retry Engine — exponential backoff with jitter
//
// Rules:
//   - Maximum 3 retry attempts (4 total calls including first)
//   - Base delay doubles each attempt: 1s → 2s → 4s
//   - ±25% jitter to prevent thundering herd
//   - AbortSignal support for saga cancellation
//   - Non-retryable errors: throw RetryAbortError to skip retries
// ============================================================

export class RetryAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryAbortError";
  }
}

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  jitter?: boolean;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
};

function computeDelay(attempt: number, baseDelayMs: number, jitter: boolean): number {
  const exp = baseDelayMs * Math.pow(2, attempt - 1);
  if (!jitter) return exp;
  const spread = exp * 0.25;
  return exp + (Math.random() * 2 - 1) * spread;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1_000;
  const jitter = opts.jitter ?? true;

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new RetryAbortError("Retry aborted by signal");
    }

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof RetryAbortError) throw err;
      if (attempt === maxAttempts) break;

      const delayMs = computeDelay(attempt, baseDelayMs, jitter);
      opts.onRetry?.(attempt, lastError, delayMs);

      await sleep(delayMs, opts.signal);
    }
  }

  throw lastError;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new RetryAbortError("Sleep aborted"));
    }, { once: true });
  });
}
