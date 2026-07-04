import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { subject, body, priority, category, booking_id } = await req.json();
    if (!subject || !body) return err("Missing subject or body");

    const db = makeServiceClient();

    const { data: ticket, error: ticketErr } = await db.from("support_tickets").insert({
      requester_id: user.id,
      subject,
      priority: priority ?? "medium",
      category: category ?? null,
      booking_id: booking_id ?? null,
      status: "open",
    }).select().single();

    if (ticketErr) return err(ticketErr.message);

    const { error: msgErr } = await db.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      body,
      is_internal: false,
    });

    if (msgErr) return err(msgErr.message);

    // Notify admins
    const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
    if (admins && admins.length > 0) {
      await db.from("notifications").insert(
        admins.map((a: { user_id: string }) => ({
          user_id: a.user_id,
          type: "new_support_ticket",
          title: "Nouveau ticket de support",
          body: subject,
          data: { ticket_id: ticket.id },
        }))
      );
    }

    return ok({ ticket }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
