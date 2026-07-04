// ============================================================
// EventBus — in-memory pub/sub singleton
//
// All domain modules subscribe to events here.
// Supabase Realtime pushes DB-side events; this bus handles
// client-side cross-module coordination.
//
// Guarantees:
//   - Typed event catalogue (no string literals after subscribe())
//   - Subscriber errors are isolated (one failure doesn't stop others)
//   - Cleanup via unsubscribe token
//   - No circular dependencies — bus has zero imports from domain modules
// ============================================================

import type { StayBFEvent, StayBFEventType, EventPayload } from "./types";

type Handler<T extends StayBFEventType> = (payload: EventPayload<T>) => void | Promise<void>;

type Subscription = {
  id: string;
  type: StayBFEventType | "*";
  handler: (event: StayBFEvent) => void | Promise<void>;
};

let _subscriptionCounter = 0;

class EventBus {
  private subscriptions: Subscription[] = [];

  emit(event: StayBFEvent): void {
    const enriched: StayBFEvent = { ...event, timestamp: event.timestamp ?? new Date().toISOString() };

    for (const sub of this.subscriptions) {
      if (sub.type === "*" || sub.type === enriched.type) {
        try {
          void sub.handler(enriched);
        } catch (err) {
          console.error(`[EventBus] Subscriber error for ${enriched.type}:`, err);
        }
      }
    }
  }

  on<T extends StayBFEventType>(type: T, handler: Handler<T>): string {
    const id = `sub-${++_subscriptionCounter}`;
    this.subscriptions.push({
      id,
      type,
      handler: (event) => {
        if (event.type === type) handler(event.payload as EventPayload<T>);
      },
    });
    return id;
  }

  onAny(handler: (event: StayBFEvent) => void): string {
    const id = `sub-${++_subscriptionCounter}`;
    this.subscriptions.push({ id, type: "*", handler });
    return id;
  }

  off(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.id !== subscriptionId);
  }

  clear(): void {
    this.subscriptions = [];
  }

  listenerCount(type?: StayBFEventType): number {
    if (!type) return this.subscriptions.length;
    return this.subscriptions.filter((s) => s.type === type || s.type === "*").length;
  }
}

export const eventBus = new EventBus();
