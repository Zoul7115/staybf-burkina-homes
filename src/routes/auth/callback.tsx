// =============================================================================
// src/routes/auth/callback.tsx
// Supabase PKCE email-confirmation callback.
//
// Supabase redirects here after:
//   - Email confirmation (signup)
//   - Magic-link sign-in
//
// URL shape:  /auth/callback?code=<pkce_code>
// Error shape: /auth/callback?error=<code>&error_description=<msg>
//
// This page calls the exchangeCodeForSession server function (which uses the
// writable SSR client to set session cookies), then activates the account
// profile, invalidates the router context, and redirects to the home page.
// =============================================================================

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exchangeCodeForSession, activateAccount } from "../../lib/auth/auth.functions";

const searchSchema = z.object({
  code:              z.string().optional(),
  error:             z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Activation — YiriGo" }] }),
  validateSearch: searchSchema,
  component: CallbackPage,
});

type Phase = "processing" | "error";

const FRIENDLY_ERRORS: Record<string, string> = {
  access_denied:  "L'accès a été refusé. Le lien est peut-être expiré.",
  otp_expired:    "Ce lien de confirmation est expiré. Demandez un nouveau lien.",
  otp_disabled:   "La confirmation par lien est désactivée sur ce projet.",
};

function friendlyError(raw: string): string {
  return FRIENDLY_ERRORS[raw] ?? "Le lien de confirmation est invalide ou a déjà été utilisé.";
}

function CallbackPage() {
  const { code, error: urlError, error_description } = Route.useSearch();
  const navigate = useNavigate();
  const router   = useRouter();

  const [phase,    setPhase]    = useState<Phase>("processing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      // Supabase propagates auth errors directly in the URL.
      if (urlError) {
        setErrorMsg(
          error_description
            ? decodeURIComponent(error_description)
            : friendlyError(urlError)
        );
        setPhase("error");
        return;
      }

      if (!code) {
        setErrorMsg("Lien invalide — aucun code d'autorisation trouvé. Vérifiez que vous avez copié l'URL complète.");
        setPhase("error");
        return;
      }

      try {
        // Exchange the PKCE code for a session (sets session cookies server-side).
        await exchangeCodeForSession({ data: { code } });

        // Activate the account profile (pending_email_verification → active).
        // Non-fatal: if already active or email not yet confirmed, we continue.
        try {
          await activateAccount({ data: {} });
        } catch {
          // Silently ignore — the root beforeLoad will resolve the real status.
        }

        // Refresh the auth context so route guards pick up the new session.
        await router.invalidate();
        await navigate({ to: "/" });
      } catch (e) {
        setErrorMsg((e as Error).message ?? "L'activation de votre compte a échoué. Réessayez ou demandez un nouveau lien.");
        setPhase("error");
      }
    }

    handle();
    // code and urlError come from the URL and never change for a given page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-card">
            <Leaf className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="font-display font-bold text-2xl tracking-tight">
            Yiri<span className="text-secondary">Go</span>
          </span>
        </Link>

        {phase === "processing" && (
          <div className="rounded-2xl border border-border bg-card shadow-card p-6 text-center space-y-4">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Activation de votre compte en cours…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border border-border bg-card shadow-card p-6 space-y-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 grid place-items-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <h1 className="font-display font-bold text-xl">Activation impossible</h1>
            </div>

            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {errorMsg}
            </div>

            <div className="space-y-2">
              <Button asChild className="w-full gradient-primary text-primary-foreground rounded-xl h-11">
                <Link to="/auth/register">Créer un nouveau compte</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full rounded-xl h-11">
                <Link to="/auth/login">Retour à la connexion</Link>
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
