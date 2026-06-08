import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kxzjyuumwxyjdlxfbaee.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4emp5dXVtd3h5amRseGZiYWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTEzMzIsImV4cCI6MjA5NTk2NzMzMn0.jXhRQ104a2EXTN96Yv4KeHdcsrpXBZl0qsXBQAzloYk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
