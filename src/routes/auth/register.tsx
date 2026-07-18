import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "../../lib/auth/auth.functions";

export const Route = createFileRoute("/auth/register")({
  head: () => ({ meta: [{ title: "Inscription — StayBF" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyPending, setVerifyPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signUp({ data: { firstName, lastName, email, password } });
      if (result.needsEmailVerification) {
        setVerifyPending(true);
      } else {
        await navigate({ to: "/" });
      }
    } catch (err) {
      setError((err as Error).message ?? "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  }

  if (verifyPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 grid place-items-center mx-auto">
            <Leaf className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display font-bold text-xl">Vérifiez votre e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Un lien de confirmation a été envoyé à{" "}
            <span className="font-medium text-foreground">{email}</span>.<br />
            Cliquez sur le lien pour activer votre compte.
          </p>
          <Link to="/auth/login" className="text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-card">
            <Leaf className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="font-display font-bold text-2xl tracking-tight">
            Stay<span className="text-secondary">BF</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-border bg-card shadow-card p-6 space-y-5">
          <div className="text-center">
            <h1 className="font-display font-bold text-xl">Créer un compte</h1>
            <p className="text-sm text-muted-foreground mt-1">Rejoignez la communauté StayBF</p>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  placeholder="Awa"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  placeholder="Traoré"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

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

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
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

            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground rounded-xl h-11"
              disabled={loading}
            >
              {loading ? "Création en cours…" : "Créer mon compte"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{" "}
            <Link to="/auth/login" className="text-primary font-medium hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
