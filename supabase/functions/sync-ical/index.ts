import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { room_id, ical_url } = await req.json();
    if (!room_id || !ical_url) return err("Missing room_id or ical_url");

    const db = makeServiceClient();

    const { data: room } = await db.from("rooms").select("id, properties(host_id)").eq("id", room_id).single();
    if (!room) return err("Room not found", 404);
    if ((room.properties as { host_id: string }).host_id !== user.id) return err("Forbidden", 403);

    // Fetch iCal data
    const icalRes = await fetch(ical_url);
    if (!icalRes.ok) return err("Failed to fetch iCal feed");
    const icalText = await icalRes.text();

    // Parse VEVENT blocks for DTSTART / DTEND
    const events: { start: string; end: string }[] = [];
    const veventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT/g;
    const dtRegex = /DT(START|END)(?:;[^:]*)?:(\d{8})/g;

    for (const block of icalText.matchAll(veventRegex)) {
      const dates: Record<string, string> = {};
      for (const m of block[0].matchAll(dtRegex)) {
        const raw = m[2];
        dates[m[1]] = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      }
      if (dates["START"] && dates["END"]) events.push({ start: dates["START"], end: dates["END"] });
    }

    // Insert blocked days for each event
    for (const ev of events) {
      await db.from("room_availability").upsert({
        room_id,
        date: ev.start,
        status: "blocked",
        source: "ical",
      }, { onConflict: "room_id,date", ignoreDuplicates: true });
    }

    return ok({ synced: events.length });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
