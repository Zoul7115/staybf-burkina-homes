import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";

// token_hash and type are injected by Supabase in the reset link query string.
const searchSchema = z.object({
  token_hash: z.string().optional(),
  type: z.string().optional(),
});

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Nouveau mot de passe — YiriGo" }] }),
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

type Phase = "verifying" | "form" | "success" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  "Token has expired or is invalid": "Ce lien de réinitialisation est expiré ou invalide.",
  "otp_expired": "Ce lien de réinitialisation est expiré.",
  "otp_disabled": "La réinitialisation par lien est désactivée.",
};

function friendlyError(raw: string): string {
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return msg;
  }
  return "Ce lien est invalide ou a déjà été utilisé.";
}

function ResetPasswordPage() {
  const { token_hash, type } = Route.useSearch();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("verifying");
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Verify the token as soon as the page loads.
  useEffect(() => {
    if (!token_hash || type !== "recovery") {
      setTokenError("Lien de réinitialisation invalide. Vérifiez que vous avez copié l'URL complète.");
      setPhase("error");
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash, type: "recovery" })
      .then(({ error }) => {
        if (error) {
          setTokenError(friendlyError(error.message));
          setPhase("error");
        } else {
          setPhase("form");
        }
      });
  // token_hash and type come from the URL and never change for a given page load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password !== confirm) {
      setFormError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 8) {
      setFormError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setFormError("Le mot de passe doit contenir au moins une majuscule.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setFormError("Le mot de passe doit contenir au moins un chiffre.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(error.message);
        return;
      }
      // Sign out so the user lands on /auth/login cleanly without being
      // redirected away by the active-session guard in auth.tsx.
      await supabase.auth.signOut();
      await navigate({ to: "/auth/login", search: { reset: "success" } });
    } catch (err) {
      setFormError((err as Error).message ?? "Une erreur est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

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

        {phase === "verifying" && (
          <div className="rounded-2xl border border-border bg-card shadow-card p-6 text-center space-y-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Vérification du lien…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border border-border bg-card shadow-card p-6 space-y-5">
            <div className="text-center">
              <h1 className="font-display font-bold text-xl">Lien invalide</h1>
            </div>
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {tokenError}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Demandez un nouveau lien depuis la page de réinitialisation.
            </p>
            <Button asChild className="w-full gradient-primary text-primary-foreground rounded-xl h-11">
              <Link to="/auth/forgot-password">Nouveau lien</Link>
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/auth/login" className="text-primary font-medium hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </div>
        )}

        {phase === "form" && (
          <div className="rounded-2xl border border-border bg-card shadow-card p-6 space-y-5">
            <div className="text-center">
              <h1 className="font-display font-bold text-xl">Nouveau mot de passe</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Choisissez un mot de passe sécurisé pour votre compte.
              </p>
            </div>

            {formError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="8+ caractères, 1 majuscule, 1 chiffre"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Répétez le mot de passe"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground rounded-xl h-11"
                disabled={saving}
              >
                {saving ? "Enregistrement…" : "Enregistrer le mot de passe"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
