// =============================================================================
// src/lib/supabase/types.ts
// Auto-generated Supabase TypeScript types.
//
// DO NOT edit manually — this file is generated from the live database schema.
//
// To regenerate after applying new migrations:
//   bun run db:types
//
// Requires:
//   • Supabase CLI installed: brew install supabase/tap/supabase
//   • Linked to remote project: supabase link --project-ref <ref>
//   • Or with explicit ref:
//       supabase gen types typescript --project-ref <ref> > src/lib/supabase/types.ts
// =============================================================================

// Placeholder type until the real schema is generated from the live project.
// Replace by running: bun run db:types
//
// The Database type is consumed by createClient<Database>(...) in client.ts,
// server.ts, and admin.ts to provide full TypeScript inference on all
// .from('table').select() calls.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
  billing: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
