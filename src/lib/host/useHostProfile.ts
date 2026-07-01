import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HostProfileWithUser } from "./types";

type ProfileUpdates = {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  locale?: string;
};

type HostProfileUpdates = {
  company_name?: string;
  bio?: string;
  payout_method?: string;
  payout_account?: string;
};

type UseHostProfileReturn = {
  profile: HostProfileWithUser | null;
  loading: boolean;
  error: string | null;
  saveProfile: (updates: ProfileUpdates) => Promise<void>;
  saveHostProfile: (updates: HostProfileUpdates) => Promise<void>;
};

export function useHostProfile(): UseHostProfileReturn {
  const [profile, setProfile] = useState<HostProfileWithUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Non authentifié");
          setLoading(false);
        }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("host_profiles")
        .select(
          `
          id,
          company_name,
          legal_form,
          bio,
          superhost,
          response_rate,
          response_time_minutes,
          host_since,
          payout_method,
          status,
          verified_at,
          created_at,
          updated_at,
          profiles!id(
            full_name,
            display_name,
            email,
            phone,
            avatar_url,
            locale,
            country
          )
        `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const p = data.profiles as {
        full_name: string | null;
        display_name: string | null;
        email: string | null;
        phone: string | null;
        avatar_url: string | null;
        locale: string;
        country: string;
      } | null;

      setProfile({
        id: data.id,
        company_name: data.company_name,
        legal_form: data.legal_form,
        bio: data.bio,
        superhost: data.superhost,
        response_rate: data.response_rate,
        response_time_minutes: data.response_time_minutes,
        host_since: data.host_since,
        payout_method: data.payout_method,
        status: data.status,
        verified_at: data.verified_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
        full_name: p?.full_name ?? null,
        display_name: p?.display_name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        avatar_url: p?.avatar_url ?? null,
        locale: p?.locale ?? "fr",
        country: p?.country ?? "BF",
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = useCallback(async (updates: ProfileUpdates) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (dbErr) throw new Error(dbErr.message);

    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const saveHostProfile = useCallback(async (updates: HostProfileUpdates) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("host_profiles")
      .update(updates)
      .eq("id", user.id);

    if (dbErr) throw new Error(dbErr.message);

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            company_name: updates.company_name ?? prev.company_name,
            bio: updates.bio ?? prev.bio,
          }
        : prev
    );
  }, []);

  return { profile, loading, error, saveProfile, saveHostProfile };
}
