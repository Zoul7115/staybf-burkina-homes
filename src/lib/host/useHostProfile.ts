import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostProfileWithUser } from "./types";

type ProfileUpdates = { full_name?: string; phone?: string; avatar_url?: string; locale?: string };
type HostProfileUpdates = { company_name?: string; bio?: string; payout_method?: string; payout_account?: string };

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostProfile(): Promise<HostProfileWithUser | null> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("host_profiles")
    .select(`id,company_name,legal_form,bio,superhost,response_rate,response_time_minutes,host_since,payout_method,status,verified_at,created_at,updated_at,profiles!id(full_name,display_name,email,phone,avatar_url,locale,country)`)
    .eq("id", user.id)
    .maybeSingle();

  if (dbErr) throw new Error(dbErr.message);
  if (!data) return null;

  const p = data.profiles as { full_name: string | null; display_name: string | null; email: string | null; phone: string | null; avatar_url: string | null; locale: string; country: string } | null;

  return {
    id: data.id, company_name: data.company_name, legal_form: data.legal_form,
    bio: data.bio, superhost: data.superhost, response_rate: data.response_rate,
    response_time_minutes: data.response_time_minutes, host_since: data.host_since,
    payout_method: data.payout_method, status: data.status, verified_at: data.verified_at,
    created_at: data.created_at, updated_at: data.updated_at,
    full_name: p?.full_name ?? null, display_name: p?.display_name ?? null,
    email: p?.email ?? null, phone: p?.phone ?? null, avatar_url: p?.avatar_url ?? null,
    locale: p?.locale ?? "fr", country: p?.country ?? "BF",
  };
}

// ── Hook ─────────────────────────────────────────────────────

type UseHostProfileReturn = {
  profile: HostProfileWithUser | null;
  loading: boolean;
  error: string | null;
  saveProfile: (updates: ProfileUpdates) => Promise<void>;
  saveHostProfile: (updates: HostProfileUpdates) => Promise<void>;
};

export function useHostProfile(): UseHostProfileReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.hostProfile();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchHostProfile });

  const saveProfileMutation = useMutation({
    mutationFn: async (updates: ProfileUpdates) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("profiles").update(updates).eq("id", user.id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<HostProfileWithUser | null>(KEY);
      queryClient.setQueryData<HostProfileWithUser | null>(KEY, (old) => old ? { ...old, ...updates } : old);
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev !== undefined) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const saveHostProfileMutation = useMutation({
    mutationFn: async (updates: HostProfileUpdates) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("host_profiles").update(updates).eq("id", user.id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<HostProfileWithUser | null>(KEY);
      queryClient.setQueryData<HostProfileWithUser | null>(KEY, (old) =>
        old ? { ...old, company_name: updates.company_name ?? old.company_name, bio: updates.bio ?? old.bio } : old
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev !== undefined) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    profile: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    saveProfile: saveProfileMutation.mutateAsync,
    saveHostProfile: saveHostProfileMutation.mutateAsync,
  };
}
