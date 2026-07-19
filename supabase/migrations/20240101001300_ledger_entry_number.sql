-- =============================================================================
-- Migration 0013 — Ledger Entry Number
-- Scope : Add sequential entry_number to wallet_ledger for audit/reconciliation
-- Depends on : 0012 (wallet_ledger)
-- Author: StayBF
-- =============================================================================

-- Sequential entry number: WL-000000001, WL-000000002, …
-- Uses a dedicated sequence so numbering survives row deletions (which are
-- forbidden on the ledger in practice, but the sequence gap doesn't matter).

CREATE SEQUENCE IF NOT EXISTS public.wallet_ledger_entry_number_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

ALTER TABLE public.wallet_ledger
  ADD COLUMN IF NOT EXISTS entry_number bigint
    NOT NULL DEFAULT nextval('public.wallet_ledger_entry_number_seq');

-- Human-readable formatted number e.g. WL-000000001
-- Generated always — no override.
ALTER TABLE public.wallet_ledger
  ADD COLUMN IF NOT EXISTS entry_ref text
    GENERATED ALWAYS AS ('WL-' || lpad(entry_number::text, 9, '0')) STORED;

-- Unique index for audit lookups by entry_ref
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_entry_ref
  ON public.wallet_ledger (entry_ref);

-- Index for sequential reporting
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entry_number
  ON public.wallet_ledger (entry_number);

-- Grant SELECT on sequence so service_role can read current value
GRANT USAGE, SELECT ON SEQUENCE public.wallet_ledger_entry_number_seq TO service_role;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP INDEX IF EXISTS public.uq_wallet_ledger_entry_ref;
-- DROP INDEX IF EXISTS public.idx_wallet_ledger_entry_number;
-- ALTER TABLE public.wallet_ledger DROP COLUMN IF EXISTS entry_ref;
-- ALTER TABLE public.wallet_ledger DROP COLUMN IF EXISTS entry_number;
-- DROP SEQUENCE IF EXISTS public.wallet_ledger_entry_number_seq;
