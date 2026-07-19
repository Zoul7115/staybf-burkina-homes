-- =============================================================================
-- 0018 — GaniPay provider integration
-- =============================================================================
-- Widens the payments.provider CHECK to allow 'ganipay'.
-- Adds payment_webhook_logs dead-letter columns.
-- Adds webhook retry fields.
-- =============================================================================


-- ── 1. Widen payments.provider CHECK ─────────────────────────────────────────

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_provider_valid;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_provider_valid
  CHECK (provider IN ('cinetpay', 'ganipay', 'manual', 'simulation'));


-- ── 2. Add paid_at to payments (for payout-complete callback) ────────────────

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS failed_at  timestamptz;


-- ── 3. Enhance payment_webhook_logs with dead-letter + retry fields ──────────

ALTER TABLE public.payment_webhook_logs
  ADD COLUMN IF NOT EXISTS retry_count     integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at   timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered   boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dead_letter_at  timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_reason text;


-- ── 4. Index for retry queue ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_webhook_logs_retry_queue
  ON public.payment_webhook_logs (next_retry_at)
  WHERE status IN ('received', 'failed') AND dead_lettered = false;


-- ── 5. Add provider_payout_id to payouts (for tracking GaniPay payout id) ───

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS provider_payout_id text,
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz;


-- ── 6. Notification type: payout_paid ────────────────────────────────────────
-- Handled in application layer — no DB enum change needed since
-- notifications.type is a text column.
