// =============================================================================
// src/lib/supabase/index.ts
// Public barrel export for the Supabase client layer.
//
// Intentionally does NOT re-export admin.ts.
// The admin client (supabaseAdmin) must be imported directly from
// src/lib/supabase/admin.ts with a deliberate, justified import statement.
// Keeping it out of this barrel prevents accidental inclusion via wildcard
// imports and makes admin usage immediately visible in code review.
// =============================================================================

// Browser client (singleton) — safe to import in components and hooks.
export { supabase } from "./client";

// Server client factory — import in createServerFn handlers only.
export { createServerSupabaseClient, createAnonServerSupabaseClient } from "./server";

// TypeScript types — used everywhere for type inference.
export type { Database, Json } from "./types";
