import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ChartPoint } from "./types";

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(ym: string): string {
  const [y, mo] = ym.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
}

export type AdminRevenueData = {
  totalRevenueFcfa: number;
  revenueChart: ChartPoint[];
  bookingsChart: ChartPoint[];
};

export type UseAdminRevenueReturn = {
  data: AdminRevenueData | null;
  loading: boolean;
  error: string | null;
};

type RawPayment = { amount_fcfa: number; captured_at: string | null };
type RawBooking = { created_at: string };
type RawMetric = { date: string; metric_key: string; metric_value: number };

export function useAdminRevenue(): UseAdminRevenueReturn {
  const [data, setData] = useState<AdminRevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const months = lastMonths(7);
      const since = `${months[0]}-01`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [paymentsRes, bookingsRes, metricsRes] = await Promise.all([
        db.from("payments").select("amount_fcfa, captured_at").eq("status", "captured"),
        db.from("bookings").select("created_at").gte("created_at", `${since}T00:00:00`),
        db.from("daily_metrics").select("date, metric_key, metric_value").eq("dimension_type", "global").gte("date", since).in("metric_key", ["gross_revenue_fcfa", "bookings_created"]),
      ]);

      if (cancelled) return;
      if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return; }

      const payments = (paymentsRes.data ?? []) as RawPayment[];
      const totalRevenueFcfa = payments.reduce((s, p) => s + (p.amount_fcfa ?? 0), 0);

      const rawMetrics = (metricsRes.data ?? []) as RawMetric[];
      const hasMetrics = rawMetrics.length > 0;

      const revenueChart: ChartPoint[] = months.map((ym) => {
        let val = 0;
        if (hasMetrics) {
          val = rawMetrics.filter((m) => m.date.startsWith(ym) && m.metric_key === "gross_revenue_fcfa").reduce((s, m) => s + (m.metric_value ?? 0), 0);
        } else {
          val = payments.filter((p) => p.captured_at?.startsWith(ym)).reduce((s, p) => s + (p.amount_fcfa ?? 0), 0);
        }
        return { label: monthLabel(ym), value: Math.round(val / 1000) };
      });

      const rawBookings = (bookingsRes.data ?? []) as RawBooking[];
      const bookingsChart: ChartPoint[] = months.map((ym) => {
        let val = 0;
        if (hasMetrics) {
          val = rawMetrics.filter((m) => m.date.startsWith(ym) && m.metric_key === "bookings_created").reduce((s, m) => s + (m.metric_value ?? 0), 0);
        } else {
          val = rawBookings.filter((b) => b.created_at.startsWith(ym)).length;
        }
        return { label: monthLabel(ym), value: Math.round(val) };
      });

      setData({ totalRevenueFcfa, revenueChart, bookingsChart });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
