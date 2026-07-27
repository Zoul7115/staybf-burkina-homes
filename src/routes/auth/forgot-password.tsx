import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Leaf, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "../../lib/auth/auth.functions";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Mot de passe oublié — YiriGo" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset({ data: { email } });
      setSent(true);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      // Ne pas révéler si l'adresse existe ou non — message neutre pour toute erreur métier
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setError("Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
      } else {
        // Supabase retourne une erreur même si l'email n'existe pas dans certaines configs.
        // On absorbe silencieusement et on affiche la confirmation neutre pour ne pas
        // révéler si le compte existe.
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 grid place-items-center mx-auto">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display font-bold text-xl">Vérifiez votre e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Si un compte existe pour{" "}
            <span className="font-medium text-foreground">{email}</span>, vous recevrez
            un lien de réinitialisation dans quelques minutes.
          </p>
          <p className="text-xs text-muted-foreground">
            Pensez à vérifier vos spams.
          </p>
          <Link to="/auth/login" className="inline-block text-sm text-primary hover:underline mt-2">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
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

        <div className="rounded-2xl border border-border bg-card shadow-card p-6 space-y-5">
          <div className="text-center">
            <h1 className="font-display font-bold text-xl">Mot de passe oublié</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground rounded-xl h-11"
              disabled={loading}
            >
              {loading ? "Envoi en cours…" : "Envoyer le lien"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/auth/login" className="text-primary font-medium hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
