import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  HostPayment,
  HostPayout,
  HostRevenueData,
  PaymentMethod,
  PaymentStatus,
  PayoutMethod,
  PayoutStatus,
} from "./types";

// French month abbreviations indexed 0–11
const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

type RawPaymentRow = {
  id: string;
  booking_id: string;
  method: string;
  status: string;
  amount_fcfa: number;
  captured_at: string | null;
  created_at: string;
  bookings: {
    reference: string;
    profiles: { full_name: string | null } | null;
  } | null;
};

type RawPayoutRow = {
  id: string;
  host_id: string;
  status: string;
  amount_fcfa: number;
  method: string;
  period_start: string;
  period_end: string;
  scheduled_for: string | null;
  paid_at: string | null;
  created_at: string;
};

type UseHostRevenueReturn = {
  data: HostRevenueData | null;
  loading: boolean;
  error: string | null;
};

export function useHostRevenue(): UseHostRevenueReturn {
  const [data, setData] = useState<HostRevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
        return;
      }

      // Fetch payments — RLS policy "payments: host read own bookings" filters automatically
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: paymentRows, error: paymentsErr } = await (supabase as any)
        .from("payments")
        .select(
          `
          id,
          booking_id,
          method,
          status,
          amount_fcfa,
          captured_at,
          created_at,
          bookings!booking_id(
            reference,
            profiles!traveler_id(full_name)
          )
          `
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (paymentsErr) {
        setError(paymentsErr.message);
        setLoading(false);
        return;
      }

      // Fetch payouts — RLS policy "payouts: host read own" uses host_id = auth.uid()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: payoutRows, error: payoutsErr } = await (supabase as any)
        .from("payouts")
        .select(
          `
          id,
          host_id,
          status,
          amount_fcfa,
          method,
          period_start,
          period_end,
          scheduled_for,
          paid_at,
          created_at
          `
        )
        .eq("host_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (payoutsErr) {
        setError(payoutsErr.message);
        setLoading(false);
        return;
      }

      // ── Map payments ──────────────────────────────────────────
      const rawPayments = (paymentRows ?? []) as RawPaymentRow[];

      const transactions: HostPayment[] = rawPayments.map((p) => {
        const booking = Array.isArray(p.bookings) ? (p.bookings[0] ?? null) : p.bookings;
        const profile = booking
          ? Array.isArray(booking.profiles)
            ? (booking.profiles[0] ?? null)
            : booking.profiles
          : null;

        return {
          id: p.id,
          booking_id: p.booking_id,
          method: p.method as PaymentMethod,
          status: p.status as PaymentStatus,
          amount_fcfa: p.amount_fcfa,
          captured_at: p.captured_at,
          created_at: p.created_at,
          booking_reference: booking?.reference ?? null,
          traveler_name: profile?.full_name ?? null,
        };
      });

      // ── Map payouts ───────────────────────────────────────────
      const rawPayouts = (payoutRows ?? []) as RawPayoutRow[];

      const payouts: HostPayout[] = rawPayouts.map((p) => ({
        id: p.id,
        host_id: p.host_id,
        status: p.status as PayoutStatus,
        amount_fcfa: p.amount_fcfa,
        method: p.method as PayoutMethod,
        period_start: p.period_start,
        period_end: p.period_end,
        scheduled_for: p.scheduled_for,
        paid_at: p.paid_at,
        created_at: p.created_at,
      }));

      // ── KPI aggregates ────────────────────────────────────────
      const capturedPayments = transactions.filter((t) => t.status === "captured");

      const totalPaidFcfa = capturedPayments.reduce((s, t) => s + t.amount_fcfa, 0);

      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth(); // 0-indexed

      const monthlyRevenueFcfa = capturedPayments
        .filter((t) => {
          if (!t.captured_at) return false;
          const d = new Date(t.captured_at);
          return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
        })
        .reduce((s, t) => s + t.amount_fcfa, 0);

      const yearlyProjectedFcfa = monthlyRevenueFcfa * 12;

      // Next payout: first scheduled or pending payout ordered by scheduled_for/created_at
      const nextPayout = payouts.find(
        (p) => p.status === "scheduled" || p.status === "pending"
      );
      const nextPayoutAmountFcfa = nextPayout?.amount_fcfa ?? null;
      const nextPayoutDate = nextPayout?.scheduled_for ?? nextPayout?.created_at ?? null;

      // ── Revenue chart: last 7 months ──────────────────────────
      // Build a map of YYYY-MM → sum of captured amount_fcfa
      const monthlyMap: Record<string, number> = {};
      for (const t of capturedPayments) {
        const d = new Date(t.captured_at ?? t.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap[key] = (monthlyMap[key] ?? 0) + t.amount_fcfa;
      }

      // Generate last 7 calendar months ending with current month
      const revenueChart: { label: string; value: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(thisYear, thisMonth - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        revenueChart.push({
          label: MONTH_LABELS[d.getMonth()],
          value: monthlyMap[key] ?? 0,
        });
      }

      setData({
        totalPaidFcfa,
        monthlyRevenueFcfa,
        yearlyProjectedFcfa,
        nextPayoutAmountFcfa,
        nextPayoutDate,
        revenueChart,
        transactions,
        payouts,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
