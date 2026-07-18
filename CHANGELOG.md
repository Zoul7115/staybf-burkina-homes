# CHANGELOG — PostgreSQL 17 + Supabase Cloud Compatibility Fixes

All changes made to make `supabase db push` succeed on a blank Supabase Cloud
PostgreSQL 17 instance without any manual intervention.

---

## 20240101000001_init_identity.sql

### Change 1 — Add missing `app_kyc_status` enum values

| | |
|---|---|
| **Lines** | 105–110 |
| **Old code** | `CREATE TYPE public.app_kyc_status AS ENUM ('none', 'pending', 'verified', 'rejected');` |
| **New code** | Added `'under_review'`, `'approved'`, `'expired'` to the enum definition |
| **Why** | Migration 0008 used `ALTER TYPE … ADD VALUE` for these values and then referenced them in a `CHECK` constraint and a partial index `WHERE` clause **in the same transaction**. PostgreSQL 17 forbids this: a newly-added enum value is not visible to DDL in the same transaction. By defining all values in the original `CREATE TYPE` in 0001, the restriction is avoided entirely and 0008 no longer needs `ADD VALUE`. |

### Change 2 — Remove `COMMENT ON TRIGGER on_auth_user_created ON auth.users`

| | |
|---|---|
| **Lines** | 453–455 |
| **Old code** | `COMMENT ON TRIGGER on_auth_user_created ON auth.users IS '...';` |
| **New code** | Statement replaced with an explanatory comment |
| **Why** | Supabase Cloud does not allow any DDL that targets objects in the `auth` schema (managed by GoTrue). `COMMENT ON TRIGGER … ON auth.users` raises `permission denied for table users` and aborts the migration. The trigger itself (`CREATE TRIGGER`) is allowed; only the `COMMENT` is forbidden. |

---

## 20240101000003_catalog.sql

### Change 3 — Schema-qualify `ll_to_earth()` in GiST index expression

| | |
|---|---|
| **Line** | 383 |
| **Old code** | `ON public.properties USING gist (ll_to_earth(latitude, longitude))` |
| **New code** | `ON public.properties USING gist (extensions.ll_to_earth(latitude, longitude))` |
| **Why** | `earthdistance` is installed in the `extensions` schema (`CREATE EXTENSION … WITH SCHEMA extensions`). In Supabase Cloud the `extensions` schema is not in the default `search_path` for DDL, so `ll_to_earth` cannot be resolved without the explicit `extensions.` qualifier. Without it, `CREATE INDEX` fails with "function ll_to_earth(double precision, double precision) does not exist". |

### Change 4 — Schema-qualify `gin_trgm_ops` operator class in GIN index

| | |
|---|---|
| **Line** | 388 |
| **Old code** | `ON public.properties USING gin (name gin_trgm_ops)` |
| **New code** | `ON public.properties USING gin (name extensions.gin_trgm_ops)` |
| **Why** | `pg_trgm` is installed in the `extensions` schema. The operator class `gin_trgm_ops` lives there and must be schema-qualified in DDL on Supabase Cloud for the same reason as `ll_to_earth`. Without it, `CREATE INDEX` fails with "operator class gin_trgm_ops does not exist for access method gin". |

---

## 20240101000008_operations_support.sql

### Change 5 — Remove `ALTER TYPE app_kyc_status ADD VALUE` statements

| | |
|---|---|
| **Lines** | 21–23 (removed) |
| **Old code** | `ALTER TYPE public.app_kyc_status ADD VALUE IF NOT EXISTS 'under_review';` (×3 for `under_review`, `approved`, `expired`) |
| **New code** | Replaced with a comment explaining the values are now defined in 0001 |
| **Why** | These three values were added here and then used in a `CHECK` constraint (line 659) and a partial index `WHERE` clause (lines 676–680) in the same migration. PostgreSQL 17 treats all statements in a single migration as one transaction and does not expose newly-added enum values to subsequent DDL within the same transaction. Moving the values to the original `CREATE TYPE` in 0001 resolves this. |

### Change 6 — Pre-add future `app_audit_action` values to the enum definition

| | |
|---|---|
| **Lines** | After line 131 (`'account_erased'`) |
| **Old code** | Enum ended at `'account_erased'` |
| **New code** | Added `'audit_log_partition_dropped'`, `'analytics_partition_dropped'`, `'analytics_partition_skipped'`, `'file_uploaded'`, `'file_deleted'`, `'file_scan_infected'`, `'file_purged'`, `'kyc_document_accessed'` |
| **Why** | Migrations 0910 and 1000 added these values via `ALTER TYPE … ADD VALUE`. While those specific usages are inside plpgsql function bodies (safe from the transaction restriction), consolidating all enum values into the original definition in 0008 removes the cross-migration `ADD VALUE` dependency and makes the enum definition the single source of truth. The corresponding `ADD VALUE` statements in 0910 and 1000 are removed. |

---

## 20240101000009_analytics_automation.sql

### Change 7 — Add `CREATE EXTENSION IF NOT EXISTS pg_cron`

| | |
|---|---|
| **Lines** | Before section 1 (new section 0) |
| **Old code** | Extension only referenced in a comment; no `CREATE EXTENSION` statement |
| **New code** | `CREATE EXTENSION IF NOT EXISTS pg_cron;` + `GRANT USAGE ON SCHEMA cron TO postgres;` |
| **Why** | The migration calls `cron.schedule()`, `cron.unschedule()`, and queries `cron.job` starting at line ~1864. Without `CREATE EXTENSION pg_cron`, PostgreSQL raises "schema cron does not exist". On Supabase Cloud, pg_cron is available as an optional extension but must be explicitly enabled. Note: pg_cron always creates the `cron` schema itself and does not accept `WITH SCHEMA`; no schema override is used. |

---

## 20240101000910_audit_fixes.sql

### Change 8 — Remove `ALTER TYPE app_audit_action ADD VALUE` statements

| | |
|---|---|
| **Lines** | 227–229 (removed) |
| **Old code** | `ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'audit_log_partition_dropped';` (×3) |
| **New code** | Replaced with a comment explaining the values are now defined in 0008 |
| **Why** | These values are now defined in the `CREATE TYPE` in migration 0008. The `ADD VALUE` statements here are redundant and removed to keep the enum definition as a single source of truth. |

---

## 20240101001000_storage_infrastructure.sql

### Change 9 — Remove `ALTER TYPE app_audit_action ADD VALUE` statements

| | |
|---|---|
| **Lines** | 61–65 (removed) |
| **Old code** | `ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'file_uploaded';` (×5) |
| **New code** | Replaced with a comment explaining the values are now defined in 0008 |
| **Why** | Same as Change 8. Values are now defined in the `CREATE TYPE` in migration 0008. |

---

## 20240101001600_column_level_security.sql

### Change 10 — Fix `SET search_path` on all 5 SECURITY DEFINER functions

| | |
|---|---|
| **Lines** | 25, 76, 125, 177, 218 |
| **Old code** | `SET search_path = public` |
| **New code** | `SET search_path = ''` |
| **Functions** | `prevent_profile_privilege_escalation`, `prevent_host_profile_privilege_escalation`, `enforce_booking_note_author`, `restrict_review_self_edit`, `validate_ticket_booking_id` |
| **Why** | The Supabase security linter and PostgreSQL best practices require `SECURITY DEFINER` functions to use `SET search_path = ''` to prevent schema-shadowing attacks (an attacker could create a function in a higher-priority schema to intercept calls). All table references in these function bodies are already fully schema-qualified (`public.*`, `auth.*`), so changing the search path has no functional impact. |

---

## 20240101001700_withdrawal_state_machine.sql

### Change 11 — Fix `SET search_path` on 2 SECURITY DEFINER functions

| | |
|---|---|
| **Lines** | 75, 133 |
| **Old code** | `SET search_path = public` |
| **New code** | `SET search_path = ''` |
| **Functions** | `validate_payout_status_transition`, `process_payout_batch` |
| **Why** | Same reason as Change 10. All references inside these functions (`public.payouts`, `OLD.status::text`, etc.) are schema-qualified or use trigger row variables that need no schema resolution. |

---

## 20240101002000_rc2_atomic_withdrawal.sql

### Change 12 — Fix `SET search_path` on `create_withdrawal_atomic`

| | |
|---|---|
| **Line** | 53 |
| **Old code** | `SET search_path = public` |
| **New code** | `SET search_path = ''` |
| **Function** | `create_withdrawal_atomic` |
| **Why** | Same reason as Change 10. All table references inside this function (`public.wallet_ledger`, `public.payouts`) are already schema-qualified. |

---

## Summary

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `20240101000001_init_identity.sql` | Added `under_review`, `approved`, `expired` to `app_kyc_status` enum | BLOCKER |
| 2 | `20240101000001_init_identity.sql` | Removed `COMMENT ON TRIGGER … ON auth.users` | BLOCKER |
| 3 | `20240101000003_catalog.sql` | Schema-qualified `ll_to_earth()` in GiST index | BLOCKER |
| 4 | `20240101000003_catalog.sql` | Schema-qualified `gin_trgm_ops` in GIN index | BLOCKER |
| 5 | `20240101000008_operations_support.sql` | Removed 3× `ALTER TYPE app_kyc_status ADD VALUE` | BLOCKER |
| 6 | `20240101000008_operations_support.sql` | Pre-added 8 `app_audit_action` values to enum definition | IMPROVEMENT |
| 7 | `20240101000009_analytics_automation.sql` | Added `CREATE EXTENSION IF NOT EXISTS pg_cron` | BLOCKER |
| 8 | `20240101000910_audit_fixes.sql` | Removed 3× `ALTER TYPE app_audit_action ADD VALUE` | IMPROVEMENT |
| 9 | `20240101001000_storage_infrastructure.sql` | Removed 5× `ALTER TYPE app_audit_action ADD VALUE` | IMPROVEMENT |
| 10 | `20240101001600_column_level_security.sql` | `SET search_path = ''` on 5 SECURITY DEFINER functions | SECURITY |
| 11 | `20240101001700_withdrawal_state_machine.sql` | `SET search_path = ''` on 2 SECURITY DEFINER functions | SECURITY |
| 12 | `20240101002000_rc2_atomic_withdrawal.sql` | `SET search_path = ''` on `create_withdrawal_atomic` | SECURITY |
