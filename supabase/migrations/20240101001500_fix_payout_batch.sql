-- Fix process_payout_batch: bookings has no host_id column; join through properties
CREATE OR REPLACE FUNCTION public.process_payout_batch(
  p_t_plus_days_subscribed integer DEFAULT 1,
  p_t_plus_days_standard   integer DEFAULT 5
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_host              record;
  v_booking           record;
  v_payout_id         uuid;
  v_total_amount      integer;
  v_payout_min        constant integer := 10000;
  v_batches_created   integer := 0;
  v_scheduled_for     timestamptz;
BEGIN
  FOR v_host IN
    SELECT
      hp.id                  AS host_id,
      hp.payout_method,
      hp.payout_account,
      SUM(b.host_payout_amount) AS total_amount,
      MIN(b.completed_at::date)  AS period_start,
      MAX(b.completed_at::date)  AS period_end,
      CASE WHEN EXISTS (
        SELECT 1
        FROM   billing.subscription_plans sp
        JOIN   billing.subscriptions s ON s.plan_id = sp.id
        WHERE  s.host_id = hp.id
          AND  s.status  IN ('trialing', 'active')
          AND  sp.slug  != 'free'
      ) THEN p_t_plus_days_subscribed
        ELSE p_t_plus_days_standard
      END AS t_plus_days
    FROM  public.bookings b
    JOIN  public.properties pr ON pr.id = b.property_id
    JOIN  public.host_profiles hp ON hp.id = pr.host_id
    WHERE b.status        = 'completed'::public.app_booking_status
      AND b.payout_status = 'pending'::public.app_payout_status
      AND hp.status       = 'verified'::public.app_host_status
      AND hp.payout_method  IS NOT NULL
      AND hp.payout_account IS NOT NULL
    GROUP BY hp.id, hp.payout_method, hp.payout_account
    HAVING SUM(b.host_payout_amount) >= v_payout_min
  LOOP
    v_scheduled_for := now() + (v_host.t_plus_days || ' days')::interval;

    BEGIN
      INSERT INTO public.payouts (
        host_id, status, amount_fcfa, method, payout_account_snapshot,
        provider, period_start, period_end, scheduled_for, created_at, updated_at
      )
      VALUES (
        v_host.host_id, 'scheduled'::public.app_payout_status, v_host.total_amount,
        v_host.payout_method, v_host.payout_account, 'fedapay',
        v_host.period_start, v_host.period_end, v_scheduled_for, now(), now()
      )
      RETURNING id INTO v_payout_id;

      FOR v_booking IN
        SELECT b.id, b.host_payout_amount
        FROM   public.bookings b
        JOIN   public.properties pr ON pr.id = b.property_id
        WHERE  pr.host_id     = v_host.host_id
          AND  b.status        = 'completed'::public.app_booking_status
          AND  b.payout_status = 'pending'::public.app_payout_status
      LOOP
        INSERT INTO public.payout_items (payout_id, booking_id, amount_fcfa)
        VALUES (v_payout_id, v_booking.id, v_booking.host_payout_amount);
      END LOOP;

      UPDATE public.bookings b
      SET    payout_status = 'scheduled'::public.app_payout_status,
             payout_id     = v_payout_id,
             updated_at    = now()
      FROM   public.properties pr
      WHERE  pr.id           = b.property_id
        AND  pr.host_id      = v_host.host_id
        AND  b.status        = 'completed'::public.app_booking_status
        AND  b.payout_status = 'pending'::public.app_payout_status;

      v_batches_created := v_batches_created + 1;

    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'process_payout_batch: concurrent batch detected for host %, skipping',
          v_host.host_id;
    END;
  END LOOP;

  RETURN v_batches_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payout_batch(integer, integer)
  TO service_role;
