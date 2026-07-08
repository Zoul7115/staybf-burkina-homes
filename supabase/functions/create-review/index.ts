import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { booking_id, overall_rating, body } = await req.json();
    if (!booking_id || !overall_rating) return err("Missing required fields");
    if (overall_rating < 1 || overall_rating > 5) return err("Rating must be between 1 and 5");

    const db = makeServiceClient();

    // Verify the booking belongs to the traveler and is completed
    const { data: booking } = await db
      .from("bookings")
      .select("id, traveler_id, status, properties!property_id(host_id)")
      .eq("id", booking_id)
      .single();

    if (!booking) return err("Booking not found", 404);
    if (booking.traveler_id !== user.id) return err("Forbidden", 403);
    if (booking.status !== "completed") return err("Can only review completed bookings");

    const prop = Array.isArray(booking.properties) ? booking.properties[0] : booking.properties;
    const hostId = (prop as { host_id: string | null } | null)?.host_id ?? null;

    // Prevent duplicate reviews
    const { data: existing } = await db
      .from("reviews")
      .select("id")
      .eq("booking_id", booking_id)
      .eq("reviewer_id", user.id)
      .maybeSingle();

    if (existing) return err("Review already submitted for this booking");

    const { data: review, error: revErr } = await db.from("reviews").insert({
      booking_id,
      reviewer_id: user.id,
      reviewee_id: hostId,
      direction: "traveler_to_host",
      overall_rating,
      body: body?.trim() ?? null,
      status: "published",
      is_published: true,
      published_at: new Date().toISOString(),
    }).select().single();

    if (revErr) return err(revErr.message);

    // Notify host
    await db.from("notifications").insert({
      user_id: hostId,
      type: "new_review",
      title: "Nouvel avis reçu",
      body: `Un voyageur a laissé un avis ${overall_rating}/5.`,
      data: { review_id: review.id, booking_id },
    });

    return ok({ review }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
