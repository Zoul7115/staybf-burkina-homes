import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminPaymentRow } from "./types";

type RawRow = {
  id: string;
  amount_fcfa: number;
  currency: string;
  status: string;
  payment_method: string | null;
  created_at: string;
  captured_at: string | null;
  bookings: {
    reference: string;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  } | {
    reference: string;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminPaymentsReturn = {
  payments: AdminPaymentRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminPayments(): UseAdminPaymentsReturn {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("payments")
        .select(`
          id, amount_fcfa, currency, status, payment_method, created_at, captured_at,
          bookings!booking_id(reference, profiles!traveler_id(full_name))
        `)
        .order("created_at", { ascending: false })
        .limit(300);

      if (cancelled) return;
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }

      const mapped: AdminPaymentRow[] = ((data ?? []) as RawRow[]).map((p) => {
        const booking = unwrap(p.bookings);
        const payer = booking ? unwrap(booking.profiles) : null;
        return {
          id: p.id,
          bookingReference: booking?.reference ?? null,
          payerName: payer?.full_name ?? null,
          method: p.payment_method,
          amountFcfa: p.amount_fcfa,
          currency: p.currency ?? "XOF",
          status: p.status,
          createdAt: p.created_at,
          capturedAt: p.captured_at,
        };
      });

      setPayments(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { payments, loading, error };
}
