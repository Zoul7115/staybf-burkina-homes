-- ============================================================
-- 0019 — Fix payment_webhook_logs provider CHECK constraint
--
-- Migration 0012 created the constraint allowing only 'cinetpay'.
-- GaniPay was added in 0018 but the constraint was not updated,
-- causing all GaniPay webhooks to fail with a CHECK violation.
-- ============================================================

ALTER TABLE public.payment_webhook_logs
  DROP CONSTRAINT IF EXISTS payment_webhook_logs_provider_valid;

ALTER TABLE public.payment_webhook_logs
  ADD CONSTRAINT payment_webhook_logs_provider_valid
  CHECK (provider IN ('cinetpay', 'ganipay', 'manual', 'simulation'));
