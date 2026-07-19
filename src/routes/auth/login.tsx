import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "../../lib/auth/auth.functions";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Connexion — StayBF" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ data: { email, password } });
      // Navigate to the space that matches the user's primary role.
      // The session cookie is set server-side during signIn; the next
      // page load will have the full auth context from getRouterAuth.
      let destination = "/";
      if (result.isAdmin) destination = "/admin/dashboard";
      else if (result.isHost) destination = "/host/dashboard";
      else if (result.isTraveler) destination = "/traveler/home";
      await navigate({ to: destination });
    } catch (err) {
      setError((err as Error).message ?? "Identifiants incorrects");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
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
            <h1 className="font-display font-bold text-xl">Connexion</h1>
            <p className="text-sm text-muted-foreground mt-1">Accédez à votre espace StayBF</p>
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <a
                  href="mailto:support@staybf.com?subject=Réinitialisation%20mot%20de%20passe"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Mot de passe oublié ?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground rounded-xl h-11"
              disabled={loading}
            >
              {loading ? "Connexion en cours…" : "Se connecter"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link to="/auth/register" className="text-primary font-medium hover:underline">
              S'inscrire
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
