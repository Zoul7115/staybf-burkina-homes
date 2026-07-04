import { describe, it, expect, vi } from "vitest";
import { withRetry, RetryAbortError } from "../retry";

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, jitter: false });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on the 3rd attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 0, jitter: false });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, jitter: false }))
      .rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on RetryAbortError", async () => {
    const fn = vi.fn().mockRejectedValue(new RetryAbortError("aborted"));
    await expect(withRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }))
      .rejects.toThrow("aborted");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback with correct attempt number", async () => {
    const retries: number[] = [];
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("done");

    await withRetry(fn, {
      maxAttempts: 4,
      baseDelayMs: 0,
      jitter: false,
      onRetry: (attempt) => retries.push(attempt),
    });

    expect(retries).toEqual([1, 2]);
  });

  it("aborts when signal is triggered", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    setTimeout(() => controller.abort(), 5);

    await expect(
      withRetry(fn, { maxAttempts: 10, baseDelayMs: 100, jitter: false, signal: controller.signal })
    ).rejects.toThrow();
  });
});
