-- =============================================================================
-- Migration 0014 — Platform Settings
-- Scope : platform_settings table for admin-configurable platform parameters
-- Depends on : 0001 (profiles, has_role, app_role, set_updated_at)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings: admin all"
  ON public.platform_settings FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

-- Seed default values
INSERT INTO public.platform_settings (key, value) VALUES
  ('platform', '{"name": "StayBF", "support_email": "support@staybf.bf", "currency": "xof", "locale": "fr"}'::jsonb),
  ('commissions', '{"discovery_pct": 15, "growth_pct": 10, "pro_pct": 8, "traveler_fee_pct": 10, "cleaning_min_fcfa": 5000, "tva_pct": 18}'::jsonb),
  ('security', '{"require_2fa_hosts": true, "auto_kyc": true, "fraud_detection": true, "maintenance_mode": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
