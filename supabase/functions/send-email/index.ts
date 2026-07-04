import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

// Integrates with Resend (or any transactional email provider).
// RESEND_API_KEY must be set as a Supabase Edge Function secret.

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAuth(req);
    const { to, subject, html, from } = await req.json();
    if (!to || !subject || !html) return err("Missing required fields: to, subject, html");

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return err("Email service not configured", 503);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from ?? "StayBF <noreply@staybf.com>",
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return err(`Email provider error: ${body}`, 502);
    }

    const db = makeServiceClient();
    await db.from("admin_actions").insert({
      actor_id: null,
      action_type: "send_email",
      target_table: null,
      target_id: null,
      notes: `to: ${Array.isArray(to) ? to.join(", ") : to} | subject: ${subject}`,
    }).then(() => undefined).catch(() => undefined);

    const data = await res.json();
    return ok({ id: (data as { id?: string }).id });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
