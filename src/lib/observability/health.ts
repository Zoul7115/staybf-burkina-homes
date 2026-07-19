// ============================================================
// Health checks — diagnostic utilities
//
// Checks connectivity to each subsystem independently.
// Used by the /health admin route and support tooling.
// Each check has a timeout so a slow subsystem doesn't
// block the entire health report.
// ============================================================

import { supabase } from "@/lib/supabase/client";

export type HealthStatus = "ok" | "degraded" | "down";

export type CheckResult = {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  detail?: string;
};

export type HealthReport = {
  overall: HealthStatus;
  checks: CheckResult[];
  timestamp: string;
};

const TIMEOUT_MS = 5_000;

async function withTimeout<T>(label: string, fn: () => Promise<T>, timeoutMs = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

async function checkDatabase(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    await withTimeout("database", async () => {
      const { error } = await (supabase as any).from("profiles").select("id").limit(1);
      if (error) throw new Error(error.message);
    });
    return { name: "database", status: "ok", latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { name: "database", status: "down", latencyMs: Math.round(performance.now() - t0), detail: (e as Error).message };
  }
}

async function checkWalletLedger(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    await withTimeout("wallet_ledger", async () => {
      const { error } = await (supabase as any).from("wallet_ledger").select("id").limit(1);
      if (error) throw new Error(error.message);
    });
    return { name: "wallet_ledger", status: "ok", latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { name: "wallet_ledger", status: "down", latencyMs: Math.round(performance.now() - t0), detail: (e as Error).message };
  }
}

async function checkRealtime(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    await withTimeout("realtime", async () => {
      // Attempt to create and immediately remove a channel — confirms WS connectivity
      await new Promise<void>((resolve, reject) => {
        const channel = (supabase as any).channel("_health_check_");
        const timer = setTimeout(() => {
          (supabase as any).removeChannel(channel);
          reject(new Error("Realtime channel subscribe timed out"));
        }, TIMEOUT_MS - 500);

        channel.subscribe((status: string) => {
          clearTimeout(timer);
          (supabase as any).removeChannel(channel);
          if (status === "SUBSCRIBED") resolve();
          else reject(new Error(`Realtime subscribe returned: ${status}`));
        });
      });
    });
    return { name: "realtime", status: "ok", latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { name: "realtime", status: "degraded", latencyMs: Math.round(performance.now() - t0), detail: (e as Error).message };
  }
}

async function checkEdgeFunctions(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    // Invoke a lightweight function (OPTIONS preflight)
    await withTimeout("edge_functions", async () => {
      const { error } = await (supabase as any).functions.invoke("send-notification", {
        method: "OPTIONS",
      });
      // OPTIONS returning 200 or CORS headers = functions are up
      if (error && !error.message?.includes("method")) throw error;
    });
    return { name: "edge_functions", status: "ok", latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      name: "edge_functions",
      status: "degraded",
      latencyMs: Math.round(performance.now() - t0),
      detail: (e as Error).message,
    };
  }
}

export async function healthCheck(): Promise<HealthReport> {
  const [dbCheck, ledgerCheck, realtimeCheck, edgeCheck] = await Promise.all([
    checkDatabase(),
    checkWalletLedger(),
    checkRealtime(),
    checkEdgeFunctions(),
  ]);

  const checks = [dbCheck, ledgerCheck, realtimeCheck, edgeCheck];

  const overall: HealthStatus =
    checks.some((c) => c.status === "down")     ? "down"     :
    checks.some((c) => c.status === "degraded") ? "degraded" :
    "ok";

  return {
    overall,
    checks,
    timestamp: new Date().toISOString(),
  };
}
