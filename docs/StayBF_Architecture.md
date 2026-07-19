# StayBF — Technical Architecture (Supabase / Lovable Cloud)

**Author:** Senior SaaS Architect
**Version:** 1.0 — Pre-development blueprint
**Scope:** Database, Auth, Authorization, Storage, API, Security, Scalability
**Stack target:** Supabase (Postgres + Auth + Storage + Realtime) behind TanStack Start (server functions).

---

## 1. Executive Summary

StayBF is a **multi-sided accommodation marketplace** for Burkina Faso with three primary actors:

| Actor | Volume (Y1 target) | Read/Write profile |
|---|---|---|
| Traveler | 50k–250k | Read-heavy (search), bursty writes (booking) |
| Host | 500–5k | Write-heavy (calendar, pricing), dashboard reads |
| Admin / Staff | 10–50 | Cross-tenant reads, moderation writes |

Architectural drivers:
1. **Strict tenant isolation** between hosts (a host must never read another host's bookings/revenue).
2. **High-trust money flow** (Orange Money, Moov Money, cards) → auditability is mandatory.
3. **Search latency < 300 ms** on property listing.
4. **Localized data** (cities, regions, FCFA currency, FR/EN/Mooré/Dioula).

---

## 2. Naming Conventions

| Object | Convention | Example |
|---|---|---|
| Schemas | `snake_case`, domain-scoped | `public`, `billing`, `ops`, `analytics` |
| Tables | plural, `snake_case` | `properties`, `booking_guests` |
| Join tables | `<a>_<b>_map` or verb | `amenities_map`, `user_roles` |
| Columns | `snake_case` | `created_at`, `host_id` |
| Primary keys | `id` (uuid v4, `gen_random_uuid()`) | |
| Foreign keys | `<referenced_table_singular>_id` | `property_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` (soft delete where relevant) | `timestamptz`, default `now()` |
| Enums | `app_<name>` | `app_role`, `app_booking_status` |
| Indexes | `idx_<table>_<cols>` | `idx_bookings_traveler_id_status` |
| RLS policies | verb + role + scope | `"hosts can update own properties"` |
| Functions | `verb_object` | `has_role`, `calculate_payout` |
| Storage buckets | kebab-case | `property-images`, `traveler-avatars` |
| API routes (server fn) | camelCase verb | `getHostDashboard`, `createBooking` |
| Public HTTP routes | `/api/public/<resource>` | `/api/public/webhooks/orange-money` |

Universal columns on every business table: `id uuid pk`, `created_at timestamptz`, `updated_at timestamptz` (via trigger).

---

## 3. Entity Relationship Diagram

See `StayBF_ERD.mmd` (Mermaid). High-level summary:

```text
auth.users ─1:1─ profiles ─1:N─ user_roles ─N:1─ roles ─N:N─ permissions
                  │
        ┌─────────┼─────────────────┐
        ▼         ▼                 ▼
  host_profiles  traveler_preferences  (admins via roles only)
        │
        ▼
   properties ─N:1─ cities ─N:1─ regions
     │  │  │
     │  │  └── amenities_map ─ amenities
     │  └── property_images
     ▼
   rooms ─ room_images
     │
     ├── availability (per-night)
     ├── seasonal_pricing
     └── bookings ─ payments ─ payouts_items ─ payouts
                │
                ├── booking_guests
                ├── reviews
                └── messages_threads ─ messages

host_profiles ─ subscriptions ─ subscription_plans
                       └── subscription_invoices

profiles ─ favorites ─ properties
profiles ─ notifications
profiles ─ support_tickets ─ ticket_messages
profiles ─ audit_logs
```

---

## 4. Role System

### 4.1 Roles (`public.app_role` enum)

| Role | Description |
|---|---|
| `traveler` | Default role on signup. Books stays. |
| `host` | Lists and manages properties. |
| `host_staff` | Sub-user under a host (front desk, manager). |
| `admin` | Internal staff with broad read + moderation. |
| `super_admin` | Platform owner — billing, role grants, destructive actions. |
| `support` | Read-only on most tables + write to support tickets. |
| `finance` | Read on payments/payouts; trigger payouts. |

A single user MAY hold multiple roles (e.g., a host who also travels).

### 4.2 Storage rule (CRITICAL)

Roles are stored in a **separate `user_roles` table**, never on `profiles`. All policy checks go through the security-definer function `public.has_role(_user_id, _role)` to prevent recursive RLS and privilege-escalation via column updates.

### 4.3 Permissions Matrix (high-level)

Legend: `R` read, `W` write own, `W*` write any, `—` none.

| Resource | traveler | host | host_staff | support | finance | admin | super_admin |
|---|---|---|---|---|---|---|---|
| profiles (self) | RW | RW | RW | R | R | R | RW* |
| properties | R (published) | RW own | RW employer's | R | R | RW* | RW* |
| rooms / availability / pricing | R | RW own | RW employer's | R | — | RW* | RW* |
| bookings | RW own | R own props | R employer's | R | R | R | W* |
| payments | R own | R own | R employer's | R | R | R | W* |
| payouts | — | R own | R employer's | — | RW* | R | RW* |
| reviews | W own (post-stay) | R + reply own | reply employer's | RW* | — | RW* | RW* |
| messages | R/W own threads | R/W own threads | R/W employer's | R | — | R | R |
| favorites | RW own | — | — | — | — | — | — |
| subscriptions | — | RW own | R | R | RW* | R | RW* |
| support_tickets | RW own | RW own | R | RW* | — | R | RW* |
| user_roles | — | — | — | — | — | R | RW* |
| audit_logs | — | — | — | R | R | R | R |
| cities / regions / amenities (ref) | R | R | R | R | R | RW* | RW* |

---

## 5. Complete Table List

### 5.1 Identity & Access (schema: `public`)

#### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | FK → `auth.users(id)` ON DELETE CASCADE |
| full_name | text | |
| display_name | text | |
| email | citext | mirrored from auth, unique |
| phone | text | E.164 |
| avatar_url | text | storage path |
| locale | text | `fr`,`en`,`mos`,`dyu` — default `fr` |
| country | text | ISO-2, default `BF` |
| date_of_birth | date | |
| kyc_status | text | `none`,`pending`,`verified`,`rejected` |
| created_at / updated_at | timestamptz | |

#### `user_roles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | FK profiles(id) cascade |
| role | app_role | enum |
| granted_by | uuid | FK profiles(id) |
| granted_at | timestamptz | default now() |
| UNIQUE (user_id, role) | | |

#### `permissions` / `role_permissions`
Static reference tables for the matrix above. Seeded; read-only at runtime.

### 5.2 Host Domain

#### `host_profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = profiles.id (1:1) |
| company_name | text | |
| legal_form | text | SARL, SA, individual |
| tax_id | text | IFU |
| bio | text | |
| superhost | boolean | default false |
| response_rate | numeric(5,2) | computed |
| response_time_minutes | int | computed |
| since | date | |
| payout_method | text | `orange_money`,`moov_money`,`bank` |
| payout_account | text | encrypted at app layer |
| stripe_connect_id | text | optional |

#### `host_staff_links`
host_id, staff_user_id, role_within_host, status. Enables host_staff scoping.

### 5.3 Catalog Domain

#### `regions`, `cities` (reference)
slug, name, geo (point), country=BF.

#### `properties`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| host_id | uuid | FK host_profiles(id) |
| city_id | uuid | FK cities(id) |
| slug | text UNIQUE | for SEO URLs |
| name | text | |
| type | text | `hotel`,`residence`,`villa`,`auberge`,`apartment` |
| description_md | text | |
| address | text | |
| latitude / longitude | numeric | |
| status | text | `draft`,`pending_review`,`published`,`suspended` |
| rating_avg | numeric(3,2) | denormalized |
| rating_count | int | denormalized |
| min_price_fcfa | int | denormalized for search sort |
| cancellation_policy | text | `flexible`,`moderate`,`strict` |
| house_rules | jsonb | |
| check_in_from / check_out_until | time | |
| published_at | timestamptz | |
| created_at / updated_at / deleted_at | | soft delete |

#### `property_images`
id, property_id, storage_path, alt, position, is_cover.

#### `amenities` (ref) + `amenities_map`
amenity slug catalog + N:N join with properties (and optionally rooms).

#### `rooms`
id, property_id, name, type, max_guests, beds jsonb, base_price_fcfa, currency=`XOF`, status.

#### `room_images` — same shape as property_images.

#### `availability`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| room_id | uuid | FK rooms cascade |
| date | date | |
| status | text | `open`,`booked`,`blocked` |
| price_override_fcfa | int NULL | |
| UNIQUE (room_id, date) | | covers ICAL imports |

#### `seasonal_pricing`
room_id, label, starts_on, ends_on, price_fcfa, min_nights.

### 5.4 Booking & Payment Domain

#### `bookings`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| reference | text UNIQUE | `STBF-XXXXXX` |
| traveler_id | uuid | FK profiles |
| property_id | uuid | FK properties |
| room_id | uuid | FK rooms |
| check_in / check_out | date | |
| nights | int generated | `(check_out - check_in)` |
| guests_adults / guests_children / guests_infants | int | |
| subtotal_fcfa | int | |
| service_fee_fcfa | int | 10% |
| taxes_fcfa | int | |
| total_fcfa | int | |
| currency | text | `XOF` |
| status | app_booking_status | `pending`,`confirmed`,`checked_in`,`completed`,`cancelled`,`refunded` |
| cancellation_reason | text | |
| host_payout_fcfa | int | denormalized |
| created_at / updated_at | | |

#### `booking_guests`
booking_id, full_name, document_type, document_number (encrypted), is_lead.

#### `payments`
id, booking_id (UNIQUE), method (`orange_money`,`moov_money`,`visa`,`mastercard`), provider_ref, status (`initiated`,`processing`,`paid`,`failed`,`refunded`), amount_fcfa, fee_fcfa, paid_at, raw_payload jsonb.

#### `payouts` + `payouts_items`
Batches per host per cycle; items link to payments.

### 5.5 Engagement Domain

#### `favorites` — traveler_id, property_id, created_at. UNIQUE pair.

#### `reviews`
id, booking_id UNIQUE, traveler_id, property_id, rating (1–5), cleanliness, communication, location, value (each 1–5), comment, host_reply, host_reply_at, status (`published`,`hidden`).

#### `messages_threads` + `messages`
Thread per (booking_id OR pre-booking inquiry). Participants stored as `(thread_id, user_id, role_at_join)`. Messages have soft attachments referencing storage.

#### `notifications`
user_id, channel (`in_app`,`email`,`sms`,`push`), kind, payload jsonb, read_at.

### 5.6 Monetization (schema: `billing`)

#### `subscription_plans` (ref)
slug, name, monthly_fcfa, yearly_fcfa, features jsonb, max_properties, commission_pct.

#### `subscriptions`
host_id, plan_id, status (`trialing`,`active`,`past_due`,`cancelled`), current_period_start/end, cancel_at_period_end, provider_ref.

#### `subscription_invoices`
subscription_id, amount_fcfa, status, due_at, paid_at, hosted_url.

### 5.7 Ops & Trust (schema: `ops`)

- `support_tickets` (opener_id, subject, status, priority, assignee_id)
- `ticket_messages` (ticket_id, author_id, body, attachments)
- `moderation_queue` (target_type, target_id, reason, status, decided_by)
- `audit_logs` (actor_id, action, target_table, target_id, diff jsonb, ip, user_agent, created_at) — append-only, partitioned by month
- `feature_flags`, `system_settings`

### 5.8 Analytics (schema: `analytics`)
Materialized views: `mv_host_revenue_daily`, `mv_property_conversion`, `mv_city_demand`. Refreshed via pg_cron.

---

## 6. Indexes

Required indexes (beyond PK):

```
-- Search & listing
CREATE INDEX idx_properties_status_city ON properties(status, city_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_min_price ON properties(min_price_fcfa) WHERE status='published';
CREATE INDEX idx_properties_rating ON properties(rating_avg DESC) WHERE status='published';
CREATE INDEX idx_properties_geo ON properties USING gist (ll_to_earth(latitude, longitude));
CREATE INDEX idx_properties_search_trgm ON properties USING gin (name gin_trgm_ops);

-- Tenant scoping (hot paths)
CREATE INDEX idx_properties_host ON properties(host_id);
CREATE INDEX idx_rooms_property ON rooms(property_id);
CREATE INDEX idx_bookings_traveler_status ON bookings(traveler_id, status);
CREATE INDEX idx_bookings_property_dates ON bookings(property_id, check_in, check_out);
CREATE INDEX idx_bookings_room_dates ON bookings(room_id, check_in, check_out);

-- Calendar
CREATE UNIQUE INDEX uq_availability_room_date ON availability(room_id, date);

-- Payments & payouts
CREATE INDEX idx_payments_status ON payments(status, paid_at DESC);
CREATE INDEX idx_payouts_host_period ON payouts(host_id, period_start);

-- Engagement
CREATE UNIQUE INDEX uq_favorites_pair ON favorites(traveler_id, property_id);
CREATE INDEX idx_reviews_property ON reviews(property_id, created_at DESC);
CREATE INDEX idx_messages_thread_time ON messages(thread_id, created_at);

-- Audit/logs
CREATE INDEX idx_audit_actor_time ON audit_logs(actor_id, created_at DESC);
```

Extensions to enable: `pgcrypto`, `citext`, `pg_trgm`, `cube`, `earthdistance`, `pg_cron`, `pgaudit` (optional).

---

## 7. Row Level Security Strategy

### Principles
1. RLS **enabled on every table** in `public`, `billing`, `ops`.
2. All policy predicates use the security-definer helpers — no recursive subqueries on the same table.
3. Default deny — explicit allow per (role × action).
4. Reference tables (cities, regions, amenities, plans) → `SELECT` open to `anon` + `authenticated`.

### Security-definer helpers
```sql
public.has_role(_user_id uuid, _role app_role) returns boolean
public.is_host_of(_user_id uuid, _property_id uuid) returns boolean
public.is_host_of_room(_user_id uuid, _room_id uuid) returns boolean
public.is_traveler_of_booking(_user_id uuid, _booking_id uuid) returns boolean
public.is_thread_participant(_user_id uuid, _thread_id uuid) returns boolean
```

### Representative policies

**properties**
- `SELECT` to anyone where `status='published'`.
- `SELECT/UPDATE` to host where `host_id = (select id from host_profiles where id = auth.uid())`.
- `ALL` to `admin`/`super_admin` via `has_role`.

**bookings**
- `SELECT` to traveler where `traveler_id = auth.uid()`.
- `SELECT` to host via `is_host_of(auth.uid(), property_id)`.
- `INSERT` to authenticated travelers; `WITH CHECK (traveler_id = auth.uid())`.
- `UPDATE status` restricted to backend service role via server functions only (no direct client writes for status).

**payments / payouts / subscriptions** — read-only for owners; all writes via server-side admin client triggered by verified webhooks (`/api/public/webhooks/*`) or server functions.

**user_roles** — `SELECT` only by self or `admin`. Writes only by `super_admin`.

### GRANTs (mandatory for every new public table)
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
-- GRANT SELECT TO anon ONLY for: properties (published), property_images,
-- rooms (of published), amenities, cities, regions, reviews (published).
```

---

## 8. Authentication Strategy

### Methods (Lovable Cloud / Supabase Auth)
- **Email + password** (primary).
- **Phone OTP** (SMS) — critical for BF market where email penetration is low.
- **Google OAuth** (via the Lovable broker — never raw `signInWithOAuth`).
- **Apple OAuth** (broker) for iOS users.
- Optional later: SAML SSO for enterprise hosts (hotel chains).

### Auth Settings to enable
- HIBP leaked-password check: ON.
- Email confirmation: ON (with `emailRedirectTo = window.location.origin`).
- Password min length 10, reuse 5.
- JWT TTL 1 h, refresh rotation ON.
- MFA TOTP required for `admin`, `super_admin`, `finance` (enforced in server middleware).

### Signup flow
1. `auth.signUp` (or phone OTP).
2. DB trigger `handle_new_user()` creates `profiles` row + assigns default role `traveler` in `user_roles`.
3. Optional `become_host()` server fn promotes user → adds `host` role + creates `host_profiles`.

### Password reset
- `resetPasswordForEmail(redirectTo=/reset-password)` + dedicated public `/reset-password` route.

---

## 9. Authorization Flow

```
Client (React) ──► server fn (createServerFn)
                   │
                   ├── middleware: requireSupabaseAuth → injects { supabase, userId, claims }
                   ├── middleware: requireRole(['host'])  ← calls has_role()
                   └── handler executes business logic with the user-scoped client
                                 │
                                 ▼
                          Postgres (RLS enforces a second time)
```

- **Two-gate model:** server middleware = primary gate (fast fail, fewer DB roundtrips); RLS = backstop.
- Admin operations (payout creation, refunds, role grants) use `supabaseAdmin` (service role) **only inside server functions** after explicit role check.
- Webhooks under `/api/public/webhooks/*` verify HMAC signatures before any DB write.

---

## 10. Supabase Storage Architecture

| Bucket | Visibility | Purpose | Path convention | Policies |
|---|---|---|---|---|
| `property-images` | public-read | hero & gallery | `{host_id}/{property_id}/{uuid}.jpg` | write: host of property; read: anyone |
| `room-images` | public-read | per-room media | `{host_id}/{property_id}/{room_id}/{uuid}.jpg` | same |
| `traveler-avatars` | public-read | profile photos | `{user_id}/avatar.jpg` | write: self |
| `host-avatars` | public-read | host profile | `{user_id}/avatar.jpg` | write: self |
| `kyc-documents` | **private** | ID & business docs | `{user_id}/{doc_type}-{uuid}.pdf` | write: self; read: self + `admin`/`support` |
| `booking-receipts` | private | generated PDFs | `{traveler_id}/{booking_id}.pdf` | read: traveler + host (of booking) + admin |
| `message-attachments` | private | chat files | `{thread_id}/{uuid}.{ext}` | read/write: thread participants |
| `host-payout-statements` | private | monthly statements | `{host_id}/{yyyy-mm}.pdf` | read: host + finance |
| `marketing-assets` | public-read | hero banners, city photos | `cities/{city_slug}/...` | write: admin |

Transformations: enable Supabase image transformation. Max upload size: 10 MB images, 25 MB PDFs. MIME allowlist enforced via storage policies.

---

## 11. API Architecture

All app logic lives in TanStack Start server functions; external integrations live in server routes.

### 11.1 Server functions (internal RPC)

Module layout (`src/lib/api/`):
```
properties.functions.ts   → searchProperties, getPropertyBySlug, createProperty,
                            updateProperty, publishProperty
rooms.functions.ts        → upsertRoom, setAvailability, setSeasonalPricing
bookings.functions.ts     → quoteBooking, createBooking, cancelBooking, checkInBooking
payments.functions.ts     → initiatePayment, confirmPayment
reviews.functions.ts      → submitReview, replyToReview
messages.functions.ts     → sendMessage, listThreads
favorites.functions.ts    → toggleFavorite
host.functions.ts         → getHostDashboard, getHostRevenue, getHostAnalytics
admin.functions.ts        → listHosts, moderateProperty, grantRole, triggerPayout
notifications.functions.ts→ markRead, listNotifications
support.functions.ts      → openTicket, replyTicket
```

Conventions:
- One file per resource domain.
- Validate every input with Zod.
- `requireSupabaseAuth` middleware on all authenticated fns; add `requireRole([...])` middleware where needed.
- Return DTOs, never raw rows with sensitive columns.

### 11.2 Public HTTP routes (`src/routes/api/public/`)

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/public/webhooks/orange-money` | payment status callback | HMAC signature |
| `POST /api/public/webhooks/moov-money` | payment status callback | HMAC signature |
| `POST /api/public/webhooks/stripe` | card payments + subscriptions | Stripe signature |
| `POST /api/public/cron/refresh-mv` | refresh materialized views | shared secret header |
| `POST /api/public/cron/process-payouts` | nightly payout batcher | shared secret |
| `GET  /api/public/health` | liveness probe | none |
| `GET  /api/public/sitemap.xml` | SEO sitemap | none |

### 11.3 Realtime channels
- `messages:thread:{id}` — chat.
- `bookings:host:{host_id}` — new reservation toasts.
- `notifications:user:{user_id}` — bell badge.

---

## 12. Recommended Folder Structure

```
src/
├─ routes/                        # TanStack file-based routes (UI — unchanged)
│  └─ api/public/                 # External HTTP endpoints
├─ lib/
│  ├─ api/                        # *.functions.ts (server functions, per domain)
│  ├─ services/                   # pure business logic (priceQuote, payoutCalc)
│  ├─ validators/                 # Zod schemas, shared with FE
│  ├─ dtos/                       # output shapes
│  └─ utils/
├─ integrations/
│  └─ supabase/
│     ├─ client.ts                # browser
│     ├─ client.server.ts         # service-role (server-only)
│     ├─ auth-middleware.ts
│     └─ auth-attacher.ts
├─ server/                        # server-only helpers (*.server.ts)
│  ├─ payments/                   # orange-money.server.ts, moov-money.server.ts
│  ├─ notifications/              # email, sms, push adapters
│  └─ jobs/                       # cron handlers
├─ components/                    # UI (unchanged)
└─ styles.css

supabase/
├─ migrations/                    # versioned SQL
│  ├─ 0001_init_identity.sql
│  ├─ 0002_catalog.sql
│  ├─ 0003_bookings_payments.sql
│  ├─ 0004_engagement.sql
│  ├─ 0005_billing.sql
│  ├─ 0006_ops.sql
│  └─ 0007_rls_policies.sql
├─ seed/                          # reference data (cities, amenities, plans)
└─ functions/                     # only true external webhooks if any
```

---

## 13. Security Best Practices

1. **No service-role key in client bundle.** `client.server.ts` only imported by `*.server.ts` or `*.functions.ts` files.
2. **RLS on every public-schema table** + grants in same migration.
3. **`SECURITY DEFINER` functions** for any cross-tenant read; `SET search_path = public`.
4. **PII encryption at app layer** for KYC document numbers and payout accounts (libsodium sealed box; keys in secrets).
5. **MFA enforced** for admin/finance/super_admin via middleware (`requireMfa`).
6. **Append-only audit log** for: role grants, payout creation, refunds, property suspension, KYC decisions.
7. **Webhook signature verification** (`timingSafeEqual`) before any DB write.
8. **Rate limiting** at server-fn level (per `userId` + per IP for anon) — sliding window in Postgres or Upstash.
9. **CSP & HSTS** headers on all routes; SameSite=Lax cookies; no `dangerouslySetInnerHTML`.
10. **Data retention:** soft-delete properties/bookings; hard-delete messages after 24 months; KYC docs purged 30 days after rejection.
11. **HIBP** + min-length passwords + leaked-password reject.
12. **Backups:** daily PITR (Supabase default) + weekly logical dump to private bucket.

---

## 14. Performance Best Practices

1. **Denormalize hot fields:** `rating_avg`, `rating_count`, `min_price_fcfa`, `host_payout_fcfa`. Maintained via triggers.
2. **Search:** combine `pg_trgm` (name) + `earthdistance` (geo radius) + composite `(status, city_id)` index. Move to Postgres FTS (`tsvector`) when catalog > 50k.
3. **Calendar queries:** the `(room_id, date)` unique index supports range scans; cap fetch window to 90 days.
4. **N+1 elimination:** use Postgres `json_agg`/views to return property + cover image + 3 amenities in one query.
5. **Server fn caching:** wrap read-only fns with TanStack Query; set `staleTime` per resource (cities: 24 h; property detail: 60 s; search: 0).
6. **Image pipeline:** Supabase Storage transformations → serve AVIF/WebP, responsive `srcset`.
7. **Connection pooling:** use Supabase Supavisor in transaction mode for serverless.
8. **Materialized views** for host analytics; refresh nightly via cron.
9. **Partition `audit_logs` and `notifications` by month** when > 10M rows.
10. **Cold-path async:** payout generation, review aggregation, email sending → background jobs (pg_cron + status table) rather than inline.

---

## 15. Future Scalability Recommendations

| Horizon | Initiative |
|---|---|
| 0–6 months | Ship as above; monitor pg_stat_statements; add Sentry + Logflare. |
| 6–12 months | Introduce read replica for analytics; move search to Postgres FTS with weighted ranking; add Redis (Upstash) for rate-limit + session cache. |
| 12–18 months | Multi-currency (XOF + EUR + USD); ledger redesign with double-entry `journal_entries` table; payout reconciliation engine. |
| 18–24 months | Switch property search to Meilisearch/Typesense for typo-tolerance + faceting. Event-driven sync via Postgres → NATS. |
| Year 2+ | Multi-country expansion (CIV, MLI, SEN) → add `countries` table, country-scoped RLS, regional storage buckets. PCI scope reduction via tokenized card vault. SOC 2 readiness. |
| Year 3+ | Mobile apps share the same server fns via OpenAPI; introduce GraphQL gateway only if mobile teams demand it. ML pricing suggestions per room (separate analytics warehouse via Fivetran → BigQuery). |

---

## 16. Migration Order (recommended)

```
0001  extensions (pgcrypto, citext, pg_trgm, cube, earthdistance) + enums
0002  identity (profiles, user_roles, has_role, triggers)
0003  reference (regions, cities, amenities, subscription_plans) + seeds
0004  catalog (host_profiles, properties, property_images, rooms, room_images, amenities_map)
0005  availability + seasonal_pricing
0006  bookings + booking_guests + payments
0007  payouts + payouts_items
0008  engagement (favorites, reviews, messages_threads, messages, notifications)
0009  billing (subscriptions, subscription_invoices)
0010  ops (support_tickets, ticket_messages, moderation_queue, audit_logs, feature_flags)
0011  analytics (materialized views) + pg_cron schedules
0012  storage buckets + storage policies
0013  RLS policies + GRANTs (consolidated review pass)
```

---

## 17. Open Questions for Product

1. **Single-room vs multi-room properties:** confirm villas/apartments are modeled as `properties` with a single `rooms` row (current assumption).
2. **Instant book vs request-to-book:** which is default? Affects `bookings.status` initial value and host SLA.
3. **Service fee split:** is the 10% borne entirely by the traveler or split with the host? Drives `host_payout_fcfa` formula.
4. **Cancellation refund matrix:** policy text exists in UI — needs formal table to compute refunds deterministically.
5. **KYC provider:** in-house review or third-party (Smile ID, Veriff)?
6. **Languages priority:** confirm Mooré / Dioula are UI-only or also content (translatable `properties.name_i18n jsonb`).

---

*End of document.*
