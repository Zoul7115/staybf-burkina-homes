// ── CORS configuration ────────────────────────────────────────
// In production, restrict Access-Control-Allow-Origin to the APP_URL
// environment variable. In sandbox/dev (no APP_URL set), fall back to '*'.
// This prevents other web origins from calling these Edge Functions.

const APP_URL = Deno.env.get("APP_URL") ?? "";
const ALLOWED_ORIGIN = APP_URL || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
