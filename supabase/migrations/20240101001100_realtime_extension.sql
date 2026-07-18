-- Enable Realtime for all operationally relevant tables
-- Only messages and notifications were previously in the publication.

ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_availability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.properties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.host_profiles;

-- Grant SELECT on room_availability to authenticated (needed by Realtime RLS filter)
-- room_availability already has full GRANT from migration 0004, no change needed.

-- Ensure RLS is respected by Realtime for all newly added tables.
-- All tables already have RLS FORCE enabled from their source migrations.
