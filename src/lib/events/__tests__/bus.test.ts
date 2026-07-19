// EventBus unit tests
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../bus-testable";

// We test the EventBus class directly via a testable export.
// Import the singleton separately for integration checks.

describe("EventBus — basic pub/sub", () => {
  it("calls a subscriber with the emitted event", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("PAYMENT_CAPTURED", handler);

    bus.emit({
      type: "PAYMENT_CAPTURED",
      payload: { paymentId: "p1", bookingId: "b1", amountFcfa: 100_000, processorFeeFcfa: 0, method: "orange_money", provider: "cinetpay", capturedAt: "" },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].paymentId).toBe("p1");
  });

  it("does NOT call subscriber for other event types", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("PAYMENT_CAPTURED", handler);

    bus.emit({ type: "BOOKING_CANCELLED", payload: { bookingId: "b1", reason: "test", cancelledBy: "traveler", refundAmountFcfa: 0 } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls wildcard subscriber for every event type", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onAny(handler);

    bus.emit({ type: "BOOKING_CANCELLED", payload: { bookingId: "b1", reason: "x", cancelledBy: "traveler", refundAmountFcfa: 0 } });
    bus.emit({ type: "REFUND_CREATED", payload: { refundId: "r1", bookingId: "b1", amountFcfa: 0 } });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("EventBus — unsubscribe", () => {
  it("stops calling handler after off()", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const id = bus.on("REFUND_CREATED", handler);

    bus.emit({ type: "REFUND_CREATED", payload: { refundId: "r1", bookingId: "b1", amountFcfa: 0 } });
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off(id);
    bus.emit({ type: "REFUND_CREATED", payload: { refundId: "r2", bookingId: "b2", amountFcfa: 0 } });
    expect(handler).toHaveBeenCalledTimes(1); // no more calls
  });

  it("off() with unknown id is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.off("non-existent-id")).not.toThrow();
  });
});

describe("EventBus — clear()", () => {
  it("removes all subscriptions", () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("PAYMENT_CAPTURED", h1);
    bus.onAny(h2);

    bus.clear();
    bus.emit({ type: "PAYMENT_CAPTURED", payload: { paymentId: "p1", bookingId: "b1", amountFcfa: 0, processorFeeFcfa: 0, method: "x", provider: "y", capturedAt: "" } });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});

describe("EventBus — listenerCount()", () => {
  it("counts specific listeners", () => {
    const bus = new EventBus();
    bus.on("PAYMENT_CAPTURED", vi.fn());
    bus.on("PAYMENT_CAPTURED", vi.fn());
    bus.on("REFUND_CREATED", vi.fn());
    expect(bus.listenerCount("PAYMENT_CAPTURED")).toBe(2);
    expect(bus.listenerCount("REFUND_CREATED")).toBe(1);
  });

  it("counts all when no type given", () => {
    const bus = new EventBus();
    bus.on("PAYMENT_CAPTURED", vi.fn());
    bus.onAny(vi.fn());
    expect(bus.listenerCount()).toBe(2);
  });
});

describe("EventBus — error isolation", () => {
  it("synchronous subscriber error does not prevent other subscribers from running", () => {
    const bus = new EventBus();
    const crasher = vi.fn().mockImplementation(() => { throw new Error("boom"); });
    const safe = vi.fn();
    bus.on("BOOKING_CANCELLED", crasher);
    bus.on("BOOKING_CANCELLED", safe);

    expect(() =>
      bus.emit({ type: "BOOKING_CANCELLED", payload: { bookingId: "b1", reason: "x", cancelledBy: "traveler", refundAmountFcfa: 0 } })
    ).not.toThrow();

    expect(crasher).toHaveBeenCalledTimes(1);
    expect(safe).toHaveBeenCalledTimes(1);
  });

  it("async subscriber rejection is caught and does not crash the bus", async () => {
    const bus = new EventBus();
    const asyncCrasher = vi.fn().mockRejectedValue(new Error("async boom"));
    bus.on("REFUND_CREATED", asyncCrasher);

    // Emit should not throw
    expect(() =>
      bus.emit({ type: "REFUND_CREATED", payload: { refundId: "r1", bookingId: "b1", amountFcfa: 0 } })
    ).not.toThrow();

    // Flush microtasks
    await new Promise((r) => setTimeout(r, 10));
    expect(asyncCrasher).toHaveBeenCalledTimes(1);
  });
});

describe("EventBus — timestamp enrichment", () => {
  it("auto-adds timestamp if absent", () => {
    const bus = new EventBus();
    let received: { timestamp?: string } | null = null;
    bus.onAny((e) => { received = e as { timestamp?: string }; });

    bus.emit({ type: "BOOKING_CANCELLED", payload: { bookingId: "b1", reason: "x", cancelledBy: "traveler", refundAmountFcfa: 0 } });
    expect(received).not.toBeNull();
    expect(typeof (received as { timestamp?: string }).timestamp).toBe("string");
  });

  it("preserves existing timestamp", () => {
    const bus = new EventBus();
    let received: { timestamp?: string } | null = null;
    bus.onAny((e) => { received = e as { timestamp?: string }; });

    const ts = "2025-01-01T00:00:00.000Z";
    bus.emit({ type: "BOOKING_CANCELLED", payload: { bookingId: "b1", reason: "x", cancelledBy: "traveler", refundAmountFcfa: 0 }, timestamp: ts });
    expect((received as { timestamp?: string } | null)?.timestamp).toBe(ts);
  });
});

describe("EventBus — multiple subscribers same event", () => {
  it("calls all subscribers in registration order", () => {
    const bus = new EventBus();
    const calls: number[] = [];
    bus.on("PAYMENT_CAPTURED", () => calls.push(1));
    bus.on("PAYMENT_CAPTURED", () => calls.push(2));
    bus.on("PAYMENT_CAPTURED", () => calls.push(3));

    bus.emit({ type: "PAYMENT_CAPTURED", payload: { paymentId: "p1", bookingId: "b1", amountFcfa: 0, processorFeeFcfa: 0, method: "x", provider: "y", capturedAt: "" } });
    expect(calls).toEqual([1, 2, 3]);
  });
});
