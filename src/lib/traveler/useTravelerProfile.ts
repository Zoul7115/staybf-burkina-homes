import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { getInitials } from "@/lib/shared";
import type { TravelerProfile } from "./types";

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(" ");
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

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

async function fetchTravelerProfile(): Promise<TravelerProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, avatar_url, phone, country, language, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const { firstName, lastName } = splitName(row?.full_name ?? null);
  const fullName = row?.full_name ?? "";
  const joinedLabel = row?.created_at
    ? format(new Date(row.created_at), "MMMM yyyy", { locale: fr })
    : "";

  return {
    id: user.id,
    firstName,
    lastName,
    fullName,
    email: user.email ?? null,
    phone: row?.phone ?? null,
    country: row?.country ?? null,
    language: row?.language ?? "Français",
    avatarUrl: row?.avatar_url ?? null,
    initials: getInitials(fullName || user.email),
    joinedLabel,
  };
}

export function useTravelerProfile(): UseProfileResult {
  const queryClient = useQueryClient();
  const KEY = queryKeys.travelerProfile();

  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: fetchTravelerProfile });

  const saveMutation = useMutation({
    mutationFn: async (updates: ProfileUpdates) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const prev = queryClient.getQueryData<TravelerProfile | null>(KEY);
      const newFirstName = updates.firstName ?? prev?.firstName ?? "";
      const newLastName = updates.lastName ?? prev?.lastName ?? "";
      const fullName = `${newFirstName} ${newLastName}`.trim() || undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("profiles")
        .update({
          ...(fullName !== undefined && { full_name: fullName }),
          ...(updates.phone !== undefined && { phone: updates.phone }),
          ...(updates.country !== undefined && { country: updates.country }),
          ...(updates.language !== undefined && { language: updates.language }),
        })
        .eq("id", user.id);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<TravelerProfile | null>(KEY);
      queryClient.setQueryData<TravelerProfile | null>(KEY, (old) => {
        if (!old) return old;
        const newFirstName = updates.firstName ?? old.firstName;
        const newLastName = updates.lastName ?? old.lastName;
        const fullName = `${newFirstName} ${newLastName}`.trim();
        return {
          ...old,
          firstName: newFirstName,
          lastName: newLastName,
          fullName,
          initials: getInitials(fullName || old.email),
          phone: updates.phone ?? old.phone,
          country: updates.country ?? old.country,
          language: updates.language ?? old.language,
        };
      });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev !== undefined) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return { profile: data ?? null, loading: isLoading, save: saveMutation.mutateAsync };
}
