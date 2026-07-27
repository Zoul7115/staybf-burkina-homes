// =============================================================================
// src/routes/auth/verify-email.tsx
// "Check your email" holding page.
//
// Shown when an authenticated user still has accountStatus ===
// "pending_email_verification" — i.e. Supabase returned a session on signup
// (email confirmation disabled or already confirmed) but the profile trigger
// has not yet transitioned the account to "active".
//
// The user needs to click the confirmation link in their inbox. Once they do,
// /auth/callback exchanges the code, calls activateAccount, and redirects to
// the home page. On return, the root beforeLoad picks up the new "active"
// status and removes this redirect.
// =============================================================================

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Leaf, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "../../lib/auth/auth.functions";

export const Route = createFileRoute("/auth/verify-email")({
  head: () => ({ meta: [{ title: "Vérification e-mail — YiriGo" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { auth }   = Route.useRouteContext();
  const navigate   = useNavigate();
  const email      = auth?.user?.email ?? null;
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await signOut({ data: {} });
    } finally {
      setLoading(false);
      await navigate({ to: "/auth/login" });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">

        <Link to="/" className="flex items-center gap-2 justify-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-card">
            <Leaf className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="font-display font-bold text-2xl tracking-tight">
            Yiri<span className="text-secondary">Go</span>
          </span>
        </Link>

        <div className="h-16 w-16 rounded-full bg-primary/10 grid place-items-center mx-auto">
          <Mail className="h-8 w-8 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display font-bold text-xl">Vérifiez votre e-mail</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Un lien de confirmation a été envoyé
            {email && (
              <>
                {" "}à{" "}
                <span className="font-medium text-foreground">{email}</span>
              </>
            )}.
            <br />
            Cliquez sur le lien pour activer votre compte YiriGo.
          </p>
          <p className="text-xs text-muted-foreground">
            Pensez à vérifier vos spams.
          </p>
        </div>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full rounded-xl h-11"
            onClick={handleSignOut}
            disabled={loading}
          >
            {loading ? "Déconnexion…" : "Se déconnecter"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Vous avez déjà activé votre compte ?{" "}
            <Link to="/auth/login" className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
