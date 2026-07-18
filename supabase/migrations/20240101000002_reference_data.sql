-- =============================================================================
-- Migration 0002 — Reference Data
-- Scope : billing schema, regions, cities, amenities, subscription_plans
-- Author: StayBF
-- =============================================================================

-- ============================================================
-- 1. BILLING SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS billing;

GRANT USAGE ON SCHEMA billing TO authenticated, anon, service_role;


-- ============================================================
-- 2. REGIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.regions (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  country     text        NOT NULL DEFAULT 'BF',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT regions_slug_unique UNIQUE (slug),
  CONSTRAINT regions_name_unique UNIQUE (name)
);

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions FORCE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) may read reference data.
CREATE POLICY "regions: public read"
  ON public.regions
  FOR SELECT
  USING (true);

-- Only super_admin may mutate.
CREATE POLICY "regions: super_admin write"
  ON public.regions
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT ON public.regions TO anon, authenticated;
GRANT ALL    ON public.regions TO service_role;

CREATE INDEX IF NOT EXISTS regions_slug_idx    ON public.regions (slug);
CREATE INDEX IF NOT EXISTS regions_country_idx ON public.regions (country);


-- ============================================================
-- 3. CITIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cities (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  region_id   uuid        NOT NULL REFERENCES public.regions (id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cities_slug_unique UNIQUE (slug)
);

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities FORCE ROW LEVEL SECURITY;

CREATE POLICY "cities: public read"
  ON public.cities
  FOR SELECT
  USING (true);

CREATE POLICY "cities: super_admin write"
  ON public.cities
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT ON public.cities TO anon, authenticated;
GRANT ALL    ON public.cities TO service_role;

CREATE INDEX IF NOT EXISTS cities_region_id_idx ON public.cities (region_id);
CREATE INDEX IF NOT EXISTS cities_slug_idx      ON public.cities (slug);


-- ============================================================
-- 4. AMENITIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.amenities (
  id         uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  slug       text NOT NULL,
  label_fr   text NOT NULL,
  label_en   text,
  category   text,
  icon       text,

  CONSTRAINT amenities_slug_unique UNIQUE (slug)
);

ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenities FORCE ROW LEVEL SECURITY;

CREATE POLICY "amenities: public read"
  ON public.amenities
  FOR SELECT
  USING (true);

CREATE POLICY "amenities: super_admin write"
  ON public.amenities
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT ON public.amenities TO anon, authenticated;
GRANT ALL    ON public.amenities TO service_role;

CREATE INDEX IF NOT EXISTS amenities_slug_idx     ON public.amenities (slug);
CREATE INDEX IF NOT EXISTS amenities_category_idx ON public.amenities (category);


-- ============================================================
-- 5. SUBSCRIPTION PLANS
-- ============================================================

CREATE TABLE IF NOT EXISTS billing.subscription_plans (
  id              uuid          PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  slug            text          NOT NULL,
  name            text          NOT NULL,
  price_fcfa      integer       NOT NULL DEFAULT 0,
  -- NULL means plan does not recur (free) or is lifetime; 'month' | 'year'
  billing_period  text,
  -- Rate frozen at booking confirmation: 0.00 (paid plans) or 0.15 (free plan)
  commission_rate numeric(4,2)  NOT NULL,
  -- NULL = unlimited
  max_properties  integer,
  trial_days      integer       NOT NULL DEFAULT 0,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT subscription_plans_slug_unique UNIQUE (slug),
  CONSTRAINT subscription_plans_price_nonneg CHECK (price_fcfa >= 0),
  CONSTRAINT subscription_plans_commission_valid CHECK (commission_rate IN (0.00, 0.15)),
  CONSTRAINT subscription_plans_billing_period_valid CHECK (
    billing_period IS NULL OR billing_period IN ('month', 'year')
  ),
  CONSTRAINT subscription_plans_trial_nonneg CHECK (trial_days >= 0),
  CONSTRAINT subscription_plans_max_props_pos CHECK (
    max_properties IS NULL OR max_properties > 0
  )
);

ALTER TABLE billing.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscription_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY "subscription_plans: public read"
  ON billing.subscription_plans
  FOR SELECT
  USING (true);

CREATE POLICY "subscription_plans: super_admin write"
  ON billing.subscription_plans
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT ON billing.subscription_plans TO anon, authenticated;
GRANT ALL    ON billing.subscription_plans TO service_role;

CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON billing.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS subscription_plans_slug_idx      ON billing.subscription_plans (slug);
CREATE INDEX IF NOT EXISTS subscription_plans_is_active_idx ON billing.subscription_plans (is_active);


-- ============================================================
-- 6. SEEDS
-- ============================================================

-- 6a. Regions — 13 administrative regions of Burkina Faso
INSERT INTO public.regions (id, name, slug, country) VALUES
  ('00000000-0002-0001-0000-000000000001', 'Boucle du Mouhoun',    'boucle-du-mouhoun',    'BF'),
  ('00000000-0002-0001-0000-000000000002', 'Cascades',             'cascades',             'BF'),
  ('00000000-0002-0001-0000-000000000003', 'Centre',               'centre',               'BF'),
  ('00000000-0002-0001-0000-000000000004', 'Centre-Est',           'centre-est',           'BF'),
  ('00000000-0002-0001-0000-000000000005', 'Centre-Nord',          'centre-nord',          'BF'),
  ('00000000-0002-0001-0000-000000000006', 'Centre-Ouest',         'centre-ouest',         'BF'),
  ('00000000-0002-0001-0000-000000000007', 'Centre-Sud',           'centre-sud',           'BF'),
  ('00000000-0002-0001-0000-000000000008', 'Est',                  'est',                  'BF'),
  ('00000000-0002-0001-0000-000000000009', 'Hauts-Bassins',        'hauts-bassins',        'BF'),
  ('00000000-0002-0001-0000-000000000010', 'Nord',                 'nord',                 'BF'),
  ('00000000-0002-0001-0000-000000000011', 'Plateau Central',      'plateau-central',      'BF'),
  ('00000000-0002-0001-0000-000000000012', 'Sahel',                'sahel',                'BF'),
  ('00000000-0002-0001-0000-000000000013', 'Sud-Ouest',            'sud-ouest',            'BF')
ON CONFLICT (slug) DO NOTHING;


-- 6b. Cities — major cities per region
INSERT INTO public.cities (id, region_id, name, slug, latitude, longitude) VALUES
  -- Boucle du Mouhoun
  ('00000000-0002-0002-0000-000000000001', '00000000-0002-0001-0000-000000000001', 'Dédougou',     'dedougou',      12.4606,  -3.4611),
  -- Cascades
  ('00000000-0002-0002-0000-000000000002', '00000000-0002-0001-0000-000000000002', 'Banfora',      'banfora',       10.6354,  -4.7642),
  -- Centre (Ouagadougou)
  ('00000000-0002-0002-0000-000000000003', '00000000-0002-0001-0000-000000000003', 'Ouagadougou',  'ouagadougou',   12.3569,  -1.5353),
  -- Centre-Est
  ('00000000-0002-0002-0000-000000000004', '00000000-0002-0001-0000-000000000004', 'Tenkodogo',    'tenkodogo',     11.7797,  -0.3693),
  -- Centre-Nord
  ('00000000-0002-0002-0000-000000000005', '00000000-0002-0001-0000-000000000005', 'Kaya',         'kaya',          13.1005,  -1.0817),
  -- Centre-Ouest
  ('00000000-0002-0002-0000-000000000006', '00000000-0002-0001-0000-000000000006', 'Koudougou',    'koudougou',     12.2500,  -2.3633),
  -- Centre-Sud
  ('00000000-0002-0002-0000-000000000007', '00000000-0002-0001-0000-000000000007', 'Manga',        'manga',         11.6667,  -1.0667),
  -- Est
  ('00000000-0002-0002-0000-000000000008', '00000000-0002-0001-0000-000000000008', 'Fada N''Gourma','fada-ngourma',  12.0618,   0.3547),
  -- Hauts-Bassins (Bobo-Dioulasso)
  ('00000000-0002-0002-0000-000000000009', '00000000-0002-0001-0000-000000000009', 'Bobo-Dioulasso','bobo-dioulasso',11.1772,  -4.2979),
  -- Nord
  ('00000000-0002-0002-0000-000000000010', '00000000-0002-0001-0000-000000000010', 'Ouahigouya',   'ouahigouya',    13.5744,  -2.4195),
  -- Plateau Central
  ('00000000-0002-0002-0000-000000000011', '00000000-0002-0001-0000-000000000011', 'Ziniaré',      'ziniare',       12.5776,  -1.2961),
  -- Sahel
  ('00000000-0002-0002-0000-000000000012', '00000000-0002-0001-0000-000000000012', 'Dori',         'dori',          14.0351,  -0.0351),
  -- Sud-Ouest
  ('00000000-0002-0002-0000-000000000013', '00000000-0002-0001-0000-000000000013', 'Gaoua',        'gaoua',         10.3197,  -3.1772)
ON CONFLICT (slug) DO NOTHING;


-- 6c. Amenities
INSERT INTO public.amenities (id, slug, label_fr, label_en, category, icon) VALUES
  -- Essentials
  ('00000000-0002-0003-0000-000000000001', 'wifi',              'Wi-Fi',                    'Wi-Fi',               'essentiel',   'wifi'),
  ('00000000-0002-0003-0000-000000000002', 'climatisation',     'Climatisation',            'Air conditioning',    'essentiel',   'thermometer'),
  ('00000000-0002-0003-0000-000000000003', 'eau-chaude',        'Eau chaude',               'Hot water',           'essentiel',   'droplet'),
  ('00000000-0002-0003-0000-000000000004', 'electricite',       'Électricité 24h/24',       'Electricity 24/7',    'essentiel',   'zap'),
  ('00000000-0002-0003-0000-000000000005', 'groupe-electrogene','Groupe électrogène',       'Generator',           'essentiel',   'battery'),
  ('00000000-0002-0003-0000-000000000006', 'ventilateur',       'Ventilateur',              'Fan',                 'essentiel',   'wind'),
  -- Kitchen
  ('00000000-0002-0003-0000-000000000007', 'cuisine-equipee',   'Cuisine équipée',          'Equipped kitchen',    'cuisine',     'utensils'),
  ('00000000-0002-0003-0000-000000000008', 'refrigerateur',     'Réfrigérateur',            'Refrigerator',        'cuisine',     'box'),
  ('00000000-0002-0003-0000-000000000009', 'micro-ondes',       'Micro-ondes',              'Microwave',           'cuisine',     'zap'),
  ('00000000-0002-0003-0000-000000000010', 'bouilloire',        'Bouilloire',               'Kettle',              'cuisine',     'coffee'),
  -- Outdoor & Leisure
  ('00000000-0002-0003-0000-000000000011', 'piscine',           'Piscine',                  'Swimming pool',       'loisir',      'droplets'),
  ('00000000-0002-0003-0000-000000000012', 'jardin',            'Jardin',                   'Garden',              'loisir',      'tree'),
  ('00000000-0002-0003-0000-000000000013', 'terrasse',          'Terrasse',                 'Terrace',             'loisir',      'sun'),
  ('00000000-0002-0003-0000-000000000014', 'barbecue',          'Barbecue',                 'Barbecue',            'loisir',      'flame'),
  -- Parking & Transport
  ('00000000-0002-0003-0000-000000000015', 'parking',           'Parking gratuit',          'Free parking',        'transport',   'car'),
  ('00000000-0002-0003-0000-000000000016', 'parking-securise',  'Parking sécurisé',         'Secured parking',     'transport',   'shield'),
  -- Services
  ('00000000-0002-0003-0000-000000000017', 'menage',            'Service de ménage',        'Cleaning service',    'service',     'sparkles'),
  ('00000000-0002-0003-0000-000000000018', 'linge-fourni',      'Linge de maison fourni',   'Linen provided',      'service',     'layers'),
  ('00000000-0002-0003-0000-000000000019', 'petit-dejeuner',    'Petit-déjeuner inclus',    'Breakfast included',  'service',     'coffee'),
  ('00000000-0002-0003-0000-000000000020', 'gardien',           'Gardien',                  'Security guard',      'service',     'user-check'),
  -- Connectivity & Work
  ('00000000-0002-0003-0000-000000000021', 'espace-travail',    'Espace de travail',        'Work space',          'travail',     'monitor'),
  ('00000000-0002-0003-0000-000000000022', 'imprimante',        'Imprimante',               'Printer',             'travail',     'printer'),
  -- Accessibility
  ('00000000-0002-0003-0000-000000000023', 'acces-pmr',         'Accès PMR',                'Wheelchair access',   'accessibilite','accessibility')
ON CONFLICT (slug) DO NOTHING;


-- 6d. Subscription plans (source of truth: Revenue & State Machines v2 §1.5)
INSERT INTO billing.subscription_plans
  (id, slug, name, price_fcfa, billing_period, commission_rate, max_properties, trial_days)
VALUES
  -- Free / Découverte: 15% commission, 1 property cap, no trial
  (
    '00000000-0002-0004-0000-000000000001',
    'free', 'Découverte',
    0, NULL, 0.15, 1, 0
  ),
  -- Monthly / Croissance: 0% commission, unlimited, 14-day trial
  (
    '00000000-0002-0004-0000-000000000002',
    'monthly', 'Croissance',
    15000, 'month', 0.00, NULL, 14
  ),
  -- Annual / Croissance Annuel: 0% commission, unlimited, 14-day trial
  (
    '00000000-0002-0004-0000-000000000003',
    'annual', 'Croissance Annuel',
    120000, 'year', 0.00, NULL, 14
  ),
  -- Premium: 0% commission, unlimited, 14-day trial
  (
    '00000000-0002-0004-0000-000000000004',
    'premium', 'Premium',
    25000, 'month', 0.00, NULL, 14
  )
ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
/*
  To roll back:

  DELETE FROM billing.subscription_plans WHERE slug IN ('free','monthly','annual','premium');
  DELETE FROM public.amenities;
  DELETE FROM public.cities;
  DELETE FROM public.regions;

  DROP TABLE IF EXISTS billing.subscription_plans;
  DROP TABLE IF EXISTS public.amenities;
  DROP TABLE IF EXISTS public.cities;
  DROP TABLE IF EXISTS public.regions;

  DROP SCHEMA IF EXISTS billing;
*/
