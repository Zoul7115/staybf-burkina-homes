import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/lib/supabase/client";
import { getInitials } from "@/lib/shared";
import type { TravelerProfile } from "./types";

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(" ");
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type ProfileUpdates = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  language?: string;
};

type UseProfileResult = {
  profile: TravelerProfile | null;
  loading: boolean;
  save: (updates: ProfileUpdates) => Promise<void>;
};

export function useTravelerProfile(): UseProfileResult {
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, avatar_url, phone_number, country, language, created_at")
      .eq("id", user.id)
      .maybeSingle();

    const { firstName, lastName } = splitName(row?.full_name ?? null);
    const fullName = row?.full_name ?? "";
    const joinedLabel = row?.created_at
      ? format(new Date(row.created_at), "MMMM yyyy", { locale: fr })
      : "";

    setProfile({
      id: user.id,
      firstName,
      lastName,
      fullName,
      email: user.email ?? null,
      phone: row?.phone_number ?? null,
      country: row?.country ?? null,
      language: row?.language ?? "Français",
      avatarUrl: row?.avatar_url ?? null,
      initials: getInitials(fullName || user.email),
      joinedLabel,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (updates: ProfileUpdates) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newFirstName = updates.firstName ?? profile?.firstName ?? "";
      const newLastName = updates.lastName ?? profile?.lastName ?? "";
      const fullName = `${newFirstName} ${newLastName}`.trim() || undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("profiles")
        .update({
          ...(fullName !== undefined && { full_name: fullName }),
          ...(updates.phone !== undefined && { phone_number: updates.phone }),
          ...(updates.country !== undefined && { country: updates.country }),
          ...(updates.language !== undefined && { language: updates.language }),
        })
        .eq("id", user.id);

      await load();
    },
    [profile, load],
  );

  return { profile, loading, save };
}
