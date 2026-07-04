import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

// Integrates with Twilio WhatsApp Business API.
// Required secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAuth(req);
    const { to, body } = await req.json();
    if (!to || !body) return err("Missing required fields: to, body");

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM");

    if (!accountSid || !authToken || !from) return err("WhatsApp service not configured", 503);

    const params = new URLSearchParams({
      From: `whatsapp:${from}`,
      To: `whatsapp:${to}`,
      Body: body,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      return err(`WhatsApp provider error: ${errBody}`, 502);
    }

    const db = makeServiceClient();
    await db.from("admin_actions").insert({
      actor_id: null,
      action_type: "send_whatsapp",
      target_table: null,
      target_id: null,
      notes: `to: ${to}`,
    }).then(() => undefined).catch(() => undefined);

    const data = await res.json();
    return ok({ sid: (data as { sid?: string }).sid });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
