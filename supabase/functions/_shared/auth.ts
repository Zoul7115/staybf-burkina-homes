import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function makeServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function getAuthUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function requireAuth(req: Request) {
  const user = await getAuthUser(req);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireRole(req: Request, role: string) {
  const user = await requireAuth(req);
  const db = makeServiceClient();
  const { data } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", role).maybeSingle();
  if (!data) throw new Error("Forbidden");
  return user;
}

export async function requireAnyRole(req: Request, roles: string[]) {
  const user = await requireAuth(req);
  const db = makeServiceClient();
  const { data } = await db.from("user_roles").select("role").eq("user_id", user.id).in("role", roles).maybeSingle();
  if (!data) throw new Error("Forbidden");
  return user;
}

// Guard for internal service-to-service calls only.
// Callers must present the service role key as Bearer token.
// Used by send-email, send-sms, send-whatsapp — channels that must
// never be directly accessible to end-users.
export function requireServiceRole(req: Request): void {
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== serviceKey) {
    throw new Error("Unauthorized");
  }
}
