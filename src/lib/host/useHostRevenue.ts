import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostPayment, HostPayout, HostRevenueData, PaymentMethod, PaymentStatus, PayoutMethod, PayoutStatus } from "./types";

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

type RawPaymentRow = {
  id: string; booking_id: string; method: string; status: string;
  amount_fcfa: number; captured_at: string | null; created_at: string;
  bookings: { reference: string; profiles: { full_name: string | null } | null } | null;
};

type RawPayoutRow = {
  id: string; host_id: string; status: string; amount_fcfa: number; method: string;
  period_start: string; period_end: string; scheduled_for: string | null; paid_at: string | null; created_at: string;
};

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostRevenue(): Promise<HostRevenueData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paymentsRes, payoutsRes] = await Promise.all([
    (supabase as any)
      .from("payments")
      .select(`id,booking_id,method,status,amount_fcfa,captured_at,created_at,bookings!booking_id(reference,profiles!traveler_id(full_name))`)
      .order("created_at", { ascending: false })
      .limit(200),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("payouts")
      .select(`id,host_id,status,amount_fcfa,method,period_start,period_end,scheduled_for,paid_at,created_at`)
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (payoutsRes.error) throw new Error(payoutsRes.error.message);

  const rawPayments = (paymentsRes.data ?? []) as RawPaymentRow[];
  const rawPayouts = (payoutsRes.data ?? []) as RawPayoutRow[];

  const transactions: HostPayment[] = rawPayments.map((p) => {
    const booking = Array.isArray(p.bookings) ? (p.bookings[0] ?? null) : p.bookings;
    const profile = booking ? (Array.isArray(booking.profiles) ? (booking.profiles[0] ?? null) : booking.profiles) : null;
    return {
      id: p.id, booking_id: p.booking_id, method: p.method as PaymentMethod,
      status: p.status as PaymentStatus, amount_fcfa: p.amount_fcfa,
      captured_at: p.captured_at, created_at: p.created_at,
      booking_reference: booking?.reference ?? null, traveler_name: profile?.full_name ?? null,
    };
  });

  const payouts: HostPayout[] = rawPayouts.map((p) => ({
    id: p.id, host_id: p.host_id, status: p.status as PayoutStatus,
    amount_fcfa: p.amount_fcfa, method: p.method as PayoutMethod,
    period_start: p.period_start, period_end: p.period_end,
    scheduled_for: p.scheduled_for, paid_at: p.paid_at, created_at: p.created_at,
  }));

  const capturedPayments = transactions.filter((t) => t.status === "captured");
  const totalPaidFcfa = capturedPayments.reduce((s, t) => s + t.amount_fcfa, 0);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const monthlyRevenueFcfa = capturedPayments
    .filter((t) => { if (!t.captured_at) return false; const d = new Date(t.captured_at); return d.getFullYear() === thisYear && d.getMonth() === thisMonth; })
    .reduce((s, t) => s + t.amount_fcfa, 0);

  const nextPayout = payouts.find((p) => p.status === "scheduled" || p.status === "pending");

  const monthlyMap: Record<string, number> = {};
  for (const t of capturedPayments) {
    const d = new Date(t.captured_at ?? t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = (monthlyMap[key] ?? 0) + t.amount_fcfa;
  }

  const revenueChart: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    revenueChart.push({ label: MONTH_LABELS[d.getMonth()], value: monthlyMap[key] ?? 0 });
  }

  return {
    totalPaidFcfa, monthlyRevenueFcfa, yearlyProjectedFcfa: monthlyRevenueFcfa * 12,
    nextPayoutAmountFcfa: nextPayout?.amount_fcfa ?? null,
    nextPayoutDate: nextPayout?.scheduled_for ?? nextPayout?.created_at ?? null,
    revenueChart, transactions, payouts,
  };
}

// ── Hook ─────────────────────────────────────────────────────

export function useHostRevenue(): { data: HostRevenueData | null; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostRevenue(),
    queryFn: fetchHostRevenue,
  });

  return { data: data ?? null, loading: isLoading, error: error?.message ?? null };
}
