import { handleCors } from "../_shared/cors.ts";
import { requireRole, makeServiceClient } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireRole(req, "admin");
    const { entity, since, until } = await req.json();

    if (!["bookings", "payments", "hosts", "travelers"].includes(entity)) {
      return err("Invalid entity");
    }

    const db = makeServiceClient();
    let rows: Record<string, unknown>[] = [];

    if (entity === "bookings") {
      const { data } = await db.from("bookings")
        .select("id,status,check_in,check_out,guests_adults,total_amount,created_at")
        .gte("created_at", since ?? "2000-01-01")
        .lte("created_at", until ?? new Date().toISOString())
        .order("created_at", { ascending: false });
      rows = data ?? [];
    } else if (entity === "payments") {
      const { data } = await db.from("payments")
        .select("id,status,amount_fcfa,captured_at,created_at")
        .gte("created_at", since ?? "2000-01-01")
        .lte("created_at", until ?? new Date().toISOString())
        .order("created_at", { ascending: false });
      rows = data ?? [];
    } else if (entity === "hosts") {
      const { data } = await db.from("host_profiles")
        .select("id,business_name,verification_status,created_at");
      rows = data ?? [];
    } else if (entity === "travelers") {
      const { data } = await db.from("profiles")
        .select("id,full_name,email,created_at")
        .order("created_at", { ascending: false });
      rows = data ?? [];
    }

    if (rows.length === 0) {
      return new Response("No data", { headers: { ...corsHeaders, "Content-Type": "text/csv" } });
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
    ].join("\n");

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${entity}-export.csv"`,
      },
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
