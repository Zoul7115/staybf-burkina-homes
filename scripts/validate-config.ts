#!/usr/bin/env bun
// =============================================================================
// scripts/validate-config.ts
// Pre-deploy environment variable validation gate.
//
// Usage:
//   bun run scripts/validate-config.ts
//   bun run validate:config
//
// Exits 0 when all checks pass.
// Exits 1 and prints a failure summary when any check fails.
// All secret values are masked — safe to run in CI logs.
// =============================================================================

import process from "node:process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(key: string): string {
  return process.env[key] ?? "";
}

function mask(value: string): string {
  if (!value) return "(empty)";
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}

function check(name: string, condition: boolean, detail?: string): Check {
  return { name, pass: condition, detail };
}

// ---------------------------------------------------------------------------
// Variable definitions
// ---------------------------------------------------------------------------

const REQUIRED: string[] = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_MEDIA_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_DB_URL",
  "SUPABASE_DB_POOLER_URL",
  "SUPABASE_PROJECT_REF",
  "LIBSODIUM_SEALED_BOX_PUBLIC_KEY",
  "LIBSODIUM_SEALED_BOX_PRIVATE_KEY",
  "CINETPAY_API_KEY",
  "CINETPAY_SITE_ID",
  "CINETPAY_WEBHOOK_SECRET",
  "ANTIVIRUS_API_URL",
  "ANTIVIRUS_API_KEY",
];

// ---------------------------------------------------------------------------
// Run checks
// ---------------------------------------------------------------------------

const results: Check[] = [];

// 1. All required variables are non-empty
for (const key of REQUIRED) {
  const value = env(key);
  results.push(check(`${key} is set`, value.length > 0, mask(value)));
}

// 2. Supabase URL format
const supabaseUrl = env("SUPABASE_URL");
const viteSupabaseUrl = env("VITE_SUPABASE_URL");
results.push(
  check(
    "SUPABASE_URL matches https://<ref>.supabase.co",
    /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl),
    mask(supabaseUrl),
  ),
);
results.push(
  check(
    "VITE_SUPABASE_URL matches https://<ref>.supabase.co",
    /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(viteSupabaseUrl),
    mask(viteSupabaseUrl),
  ),
);

// 3. SUPABASE_URL and VITE_SUPABASE_URL point to the same project
results.push(
  check(
    "SUPABASE_URL and VITE_SUPABASE_URL are the same project",
    supabaseUrl === viteSupabaseUrl || !supabaseUrl || !viteSupabaseUrl,
    supabaseUrl && viteSupabaseUrl && supabaseUrl !== viteSupabaseUrl
      ? `mismatch: ${mask(supabaseUrl)} vs ${mask(viteSupabaseUrl)}`
      : undefined,
  ),
);

// 4. SUPABASE_ANON_KEY and VITE_SUPABASE_ANON_KEY are consistent
const anonKey = env("SUPABASE_ANON_KEY");
const viteAnonKey = env("VITE_SUPABASE_ANON_KEY");
results.push(
  check(
    "SUPABASE_ANON_KEY and VITE_SUPABASE_ANON_KEY are the same",
    anonKey === viteAnonKey || !anonKey || !viteAnonKey,
    anonKey && viteAnonKey && anonKey !== viteAnonKey ? "mismatch detected" : undefined,
  ),
);

// 5. JWT secret minimum length (weak secret is a security risk)
const jwtSecret = env("SUPABASE_JWT_SECRET");
results.push(
  check(
    "SUPABASE_JWT_SECRET length >= 32 characters",
    jwtSecret.length >= 32,
    `length: ${jwtSecret.length}`,
  ),
);

// 6. service_role key must not equal anon key (common copy-paste mistake)
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
results.push(
  check(
    "SUPABASE_SERVICE_ROLE_KEY differs from SUPABASE_ANON_KEY",
    !serviceRoleKey || !anonKey || serviceRoleKey !== anonKey,
    serviceRoleKey === anonKey ? "DANGER: service_role key equals anon key" : undefined,
  ),
);

// 7. Libsodium keys are different (public != private)
const boxPublic = env("LIBSODIUM_SEALED_BOX_PUBLIC_KEY");
const boxPrivate = env("LIBSODIUM_SEALED_BOX_PRIVATE_KEY");
results.push(
  check(
    "LIBSODIUM public key and private key are different",
    !boxPublic || !boxPrivate || boxPublic !== boxPrivate,
    boxPublic === boxPrivate ? "DANGER: public and private keys are identical" : undefined,
  ),
);

// 8. DB URL starts with postgresql://
const dbUrl = env("SUPABASE_DB_URL");
results.push(
  check(
    "SUPABASE_DB_URL starts with postgresql://",
    !dbUrl || dbUrl.startsWith("postgresql://"),
    mask(dbUrl),
  ),
);

const dbPoolerUrl = env("SUPABASE_DB_POOLER_URL");
results.push(
  check(
    "SUPABASE_DB_POOLER_URL starts with postgresql://",
    !dbPoolerUrl || dbPoolerUrl.startsWith("postgresql://"),
    mask(dbPoolerUrl),
  ),
);

// 9. VITE_MEDIA_BASE_URL starts with https://
const mediaBaseUrl = env("VITE_MEDIA_BASE_URL");
results.push(
  check(
    "VITE_MEDIA_BASE_URL starts with https://",
    !mediaBaseUrl || mediaBaseUrl.startsWith("https://"),
    mask(mediaBaseUrl),
  ),
);

// 10. Project ref is a lowercase alphanumeric string (no full URL by mistake)
const projectRef = env("SUPABASE_PROJECT_REF");
results.push(
  check(
    "SUPABASE_PROJECT_REF is a short ref (not a full URL)",
    !projectRef || (/^[a-z0-9]+$/.test(projectRef) && projectRef.length <= 40),
    projectRef.includes("://") ? "looks like a full URL, expected short ref only" : projectRef,
  ),
);

// ---------------------------------------------------------------------------
// Output results
// ---------------------------------------------------------------------------

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";

console.log("\n\x1b[1mStayBF — Configuration Validation\x1b[0m\n");

for (const r of results) {
  const icon = r.pass ? PASS : FAIL;
  const detail = r.detail ? `  \x1b[90m(${r.detail})\x1b[0m` : "";
  console.log(`  ${icon}  ${r.name}${detail}`);
}

const failures = results.filter((r) => !r.pass);

console.log("");

if (failures.length === 0) {
  console.log("\x1b[32m  All checks passed.\x1b[0m\n");
  process.exit(0);
} else {
  console.log(`\x1b[31m  ${failures.length} check(s) failed:\x1b[0m`);
  for (const f of failures) {
    console.log(`    - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  }
  console.log("");
  process.exit(1);
}
