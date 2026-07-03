import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, CheckCircle2, UserCircle2 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/widgets";
import { useHostProfile, useHostReviews, useHostBookings } from "@/lib/host";
import { getInitials } from "@/lib/shared";

export const Route = createFileRoute("/host/profile")({ component: HostProfilePage });

// ── Helpers ───────────────────────────────────────────────────

function fmtResponseTime(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return "< 1h";
  if (minutes < 120) return "~1h";
  if (minutes < 1440) return `~${Math.round(minutes / 60)}h`;
  return `~${Math.round(minutes / 1440)} jour${minutes >= 2880 ? "s" : ""}`;
}

function fmtHostSince(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ── Skeleton ──────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2 mt-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <Skeleton className="h-5 w-44" />
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-24 w-full rounded-md" />
        </Card>

        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <aside>
        <Card className="p-5 space-y-3">
          <Skeleton className="h-5 w-36" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

function HostProfilePage() {
  const { profile, loading, error, saveProfile, saveHostProfile } = useHostProfile();
  const { data: reviewsData, loading: reviewsLoading } = useHostReviews();
  const { bookings, loading: bookingsLoading } = useHostBookings();

  // Local form state — mirrors editable profile fields
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Initialise form when profile loads
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setCompany(profile.company_name ?? "");
      setPhone(profile.phone ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    try {
      // Update profiles table (full_name, phone)
      if (fullName !== (profile.full_name ?? "") || phone !== (profile.phone ?? "")) {
        await saveProfile({
          full_name: fullName || undefined,
          phone: phone || undefined,
        });
      }
      // Update host_profiles table (company_name, bio)
      if (
        company !== (profile.company_name ?? "") ||
        bio !== (profile.bio ?? "")
      ) {
        await saveHostProfile({
          company_name: company || undefined,
          bio: bio || undefined,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ProfileSkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur : {error}
      </Card>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={UserCircle2}
        title="Profil introuvable"
        description="Aucun profil hôte trouvé pour votre compte. Contactez le support."
      />
    );
  }

  const isVerified = !!profile.verified_at;
  const totalBookings = bookingsLoading ? null : bookings.length;
  const totalReviews = reviewsLoading ? null : (reviewsData?.totalCount ?? 0);
  const avgRating = reviewsLoading ? null : reviewsData?.avgRating;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        {/* Avatar + name header */}
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl gradient-primary text-primary-foreground grid place-items-center font-display text-2xl font-bold shrink-0">
              {getInitials(profile.full_name ?? profile.display_name)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-xl truncate">
                {profile.full_name ?? profile.display_name ?? "—"}
              </h2>
              {profile.company_name && (
                <p className="text-sm text-muted-foreground truncate">{profile.company_name}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {profile.superhost && (
                  <Badge className="bg-secondary/20 text-secondary-foreground border-secondary/30">
                    <Award className="h-3 w-3 mr-1" /> Superhôte
                  </Badge>
                )}
                {isVerified && (
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Vérifié
                  </Badge>
                )}
              </div>
            </div>
            {/* Avatar upload requires a signed Storage URL — disabled until Edge Function available */}
            <Button variant="outline" disabled title="Modification de la photo — à venir">
              Changer la photo
            </Button>
          </div>
        </Card>

        {/* Editable form */}
        <form onSubmit={handleSave} className="space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Informations personnelles</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="full-name">Nom complet</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="company">Société</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                {/* Email change requires Supabase auth API — shown read-only */}
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={profile.email ?? ""}
                  readOnly
                  disabled
                  className="mt-1.5 opacity-60 cursor-not-allowed"
                  title="La modification de l'email s'effectue via les paramètres de sécurité"
                />
              </div>
              <div>
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Bio publique</h3>
            <Textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Partagez votre expérience d'hôte et ce qui rend votre hébergement unique…"
            />
          </Card>

          {saveError && (
            <p className="text-xs text-destructive">{saveError}</p>
          )}

          <Button
            type="submit"
            className="gradient-primary text-primary-foreground"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : saved ? "Enregistré ✓" : "Enregistrer"}
          </Button>
        </form>
      </div>

      {/* Sidebar stats */}
      <aside>
        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold">Statistiques hôte</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Membre depuis</span>
              <span className="font-semibold">{fmtHostSince(profile.host_since)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Réservations totales</span>
              <span className="font-semibold">
                {totalBookings === null ? "…" : totalBookings}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Avis reçus</span>
              <span className="font-semibold">
                {totalReviews === null ? "…" : totalReviews}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Note moyenne</span>
              <span className="font-semibold">
                {avgRating === null ? "—" : avgRating === undefined ? "…" : `${avgRating.toFixed(2)} ★`}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Taux de réponse</span>
              <span className="font-semibold">
                {profile.response_rate !== null
                  ? `${Number(profile.response_rate).toFixed(0)} %`
                  : "—"}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Temps de réponse</span>
              <span className="font-semibold">
                {fmtResponseTime(profile.response_time_minutes)}
              </span>
            </li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
