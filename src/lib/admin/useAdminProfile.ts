import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { getInitials } from "@/lib/shared";

export type AdminProfile = {
  name: string;
  email: string;
  avatar: string;
  role: string;
};

async function fetchAdminProfile(): Promise<AdminProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { name: "Admin", email: "", avatar: "AD", role: "admin" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profileRes, rolesRes] = await Promise.all([
    (supabase as any).from("profiles").select("full_name, display_name, email").eq("id", user.id).maybeSingle(),
    (supabase as any).from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
  ]);

  const p = profileRes.data;
  const name = p?.full_name ?? p?.display_name ?? user.email ?? "Admin";
  return {
    name,
    email: p?.email ?? user.email ?? "",
    avatar: getInitials(name),
    role: rolesRes.data?.role ?? "admin",
  };
}

export function useAdminProfile(): { profile: AdminProfile; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminProfile(),
    queryFn: fetchAdminProfile,
    staleTime: 300_000,
  });

  return {
    profile: data ?? { name: "Admin", email: "", avatar: "AD", role: "admin" },
    loading: isLoading,
  };
}
