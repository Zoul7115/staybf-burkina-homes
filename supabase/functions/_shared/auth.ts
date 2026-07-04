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
