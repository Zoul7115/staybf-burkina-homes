import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminSubscriptionRow } from "./types";

type RawRow = {
  id: string; status: string; started_at: string | null; current_period_end: string | null; cancelled_at: string | null;
  host_profiles: { profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { profiles: unknown }[] | null;
  subscription_plans: { name: string; price_fcfa: number } | { name: string; price_fcfa: number }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminSubscriptions(): Promise<AdminSubscriptionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .schema("billing")
    .from("subscriptions")
    .select(`id,status,started_at,current_period_end,cancelled_at,host_profiles!host_id(profiles!id(full_name)),subscription_plans!plan_id(name,price_fcfa)`)
    .order("started_at", { ascending: false })
    .limit(200);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((s) => {
    const hp = unwrap(s.host_profiles);
    const prof = hp ? unwrap((hp as { profiles: unknown }).profiles as RawRow["host_profiles"]) : null;
    const profObj = prof as { full_name: string | null } | null;
    const plan = unwrap(s.subscription_plans);
    return {
      id: s.id, hostName: profObj?.full_name ?? null,
      planName: plan?.name ?? null, planPriceFcfa: plan?.price_fcfa ?? 0,
      status: s.status, startedAt: s.started_at,
      currentPeriodEnd: s.current_period_end, cancelledAt: s.cancelled_at,
    };
  });
}

export type UseAdminSubscriptionsReturn = {
  subscriptions: AdminSubscriptionRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminSubscriptions(): UseAdminSubscriptionsReturn {
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.adminSubscriptions(), queryFn: fetchAdminSubscriptions });
  return { subscriptions: data ?? [], loading: isLoading, error: error?.message ?? null };
}
