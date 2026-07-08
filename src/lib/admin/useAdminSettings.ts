import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

export type PlatformConfig = {
  name: string;
  support_email: string;
  currency: string;
  locale: string;
};

export type CommissionsConfig = {
  discovery_pct: number;
  growth_pct: number;
  pro_pct: number;
  traveler_fee_pct: number;
  cleaning_min_fcfa: number;
  tva_pct: number;
};

export type SecurityConfig = {
  require_2fa_hosts: boolean;
  auto_kyc: boolean;
  fraud_detection: boolean;
  maintenance_mode: boolean;
};

export type AdminSettings = {
  platform: PlatformConfig;
  commissions: CommissionsConfig;
  security: SecurityConfig;
};

const DEFAULTS: AdminSettings = {
  platform: { name: "StayBF", support_email: "support@staybf.bf", currency: "xof", locale: "fr" },
  commissions: { discovery_pct: 15, growth_pct: 10, pro_pct: 8, traveler_fee_pct: 10, cleaning_min_fcfa: 5000, tva_pct: 18 },
  security: { require_2fa_hosts: true, auto_kyc: true, fraud_detection: true, maintenance_mode: false },
};

async function fetchAdminSettings(): Promise<AdminSettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("platform_settings")
    .select("key,value")
    .in("key", ["platform", "commissions", "security"]);

  if (error) throw new Error(error.message);

  const map = ((data ?? []) as { key: string; value: unknown }[]).reduce<Record<string, unknown>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  return {
    platform: (map.platform as PlatformConfig) ?? DEFAULTS.platform,
    commissions: (map.commissions as CommissionsConfig) ?? DEFAULTS.commissions,
    security: (map.security as SecurityConfig) ?? DEFAULTS.security,
  };
}

async function upsertSetting(key: string, value: unknown): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("platform_settings")
    .upsert({ key, value, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) throw new Error(error.message);
}

export type UseAdminSettingsReturn = {
  settings: AdminSettings;
  loading: boolean;
  error: string | null;
  saveSettings: (key: keyof AdminSettings, value: AdminSettings[keyof AdminSettings]) => Promise<void>;
  saving: boolean;
  saveError: string | null;
};

export function useAdminSettings(): UseAdminSettingsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminSettings();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminSettings });

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: keyof AdminSettings; value: AdminSettings[keyof AdminSettings] }) =>
      upsertSetting(key, value),
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminSettings>(KEY);
      if (prev) queryClient.setQueryData<AdminSettings>(KEY, { ...prev, [key]: value });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    settings: data ?? DEFAULTS,
    loading: isLoading,
    error: error?.message ?? null,
    saveSettings: (key, value) => saveMutation.mutateAsync({ key, value }).then(() => undefined),
    saving: saveMutation.isPending,
    saveError: saveMutation.error?.message ?? null,
  };
}
