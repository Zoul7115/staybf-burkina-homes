import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Camera, ExternalLink, CheckCircle2 } from "lucide-react";
import { useHostPropertyDetail } from "@/lib/host";
import { toPublicUrl, coverImageUrl, PLACEHOLDER_IMG } from "@/lib/shared";
import { EmptyState } from "@/components/dashboard/widgets";
import { Home } from "lucide-react";

export const Route = createFileRoute("/host/property")({ component: HostPropertyPage });

function statusLabel(status: string): string {
  switch (status) {
    case "published": return "Publié";
    case "submitted": return "Soumis";
    case "under_review": return "En révision";
    case "rejected": return "Refusé";
    case "suspended": return "Suspendu";
    case "archived": return "Archivé";
    default: return "Brouillon";
  }
}

function statusVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "published") return "default";
  if (status === "rejected" || status === "suspended") return "destructive";
  return "outline";
}

function PropertySkeleton() {
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        <Card className="p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={i === 0 || i === 2 ? "sm:col-span-2" : ""}>
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-28 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-24 mb-4" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-20 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card className="p-5">
          <Skeleton className="h-4 w-40 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="h-4 w-32 mb-3" />
          <Skeleton className="aspect-video w-full rounded-xl mb-3" />
          <Skeleton className="h-4 w-40 mb-1" />
          <Skeleton className="h-3 w-28" />
        </Card>
      </aside>
    </div>
  );
}

function HostPropertyPage() {
  const { property: p, loading, error } = useHostPropertyDetail();

  if (loading) return <PropertySkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement : {error}
      </Card>
    );
  }

  if (!p) {
    return (
      <EmptyState
        icon={Home}
        title="Aucun hébergement"
        description="Vous n'avez pas encore d'hébergement. Créez votre premier logement pour commencer à recevoir des voyageurs."
        action={
          <Button className="gradient-primary text-primary-foreground">
            Créer un hébergement
          </Button>
        }
      />
    );
  }

  const coverUrl = p.images.length > 0 ? coverImageUrl(p.images) : PLACEHOLDER_IMG;
  const galleryImages = p.images.slice(0, 8);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-lg">Informations</h3>
            <Badge
              variant={statusVariant(p.status)}
              className={p.status === "published" ? "bg-primary/10 text-primary border border-primary/20" : ""}
            >
              {statusLabel(p.status)}
            </Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Nom de l'hébergement</Label>
              <Input defaultValue={p.name} className="mt-1.5" />
            </div>
            <div>
              <Label>Ville</Label>
              <Input defaultValue={p.city_name ?? ""} className="mt-1.5" />
            </div>
            <div>
              <Label>Type</Label>
              <Input defaultValue={p.type} className="mt-1.5" readOnly />
            </div>
            <div className="sm:col-span-2">
              <Label>Adresse complète</Label>
              <Input defaultValue={p.address ?? ""} className="mt-1.5" />
            </div>
            <div>
              <Label>Latitude</Label>
              <Input defaultValue={p.latitude != null ? String(p.latitude) : ""} className="mt-1.5" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input defaultValue={p.longitude != null ? String(p.longitude) : ""} className="mt-1.5" />
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold text-lg">Description</h3>
          <Textarea rows={5} defaultValue={p.description_md ?? ""} />
          <p className="text-xs text-muted-foreground">Présentez votre hébergement de manière claire et accueillante.</p>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-lg mb-4">Équipements</h3>
          <div className="flex flex-wrap gap-2">
            {p.amenities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun équipement renseigné.</p>
            ) : (
              p.amenities.map((a) => (
                <Badge key={a.id} variant="outline" className="rounded-full px-3 py-1.5 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1 text-primary" /> {a.label_fr}
                </Badge>
              ))
            )}
            <Button size="sm" variant="outline" className="rounded-full h-auto py-1.5">+ Ajouter</Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg">Photos</h3>
            <Button size="sm" variant="outline"><Camera className="h-4 w-4 mr-1.5" /> Ajouter</Button>
          </div>
          {galleryImages.length === 0 ? (
            <div className="aspect-video rounded-xl bg-muted grid place-items-center text-sm text-muted-foreground">
              Aucune photo ajoutée
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {galleryImages.map((img, i) => (
                <div key={img.id} className="aspect-square rounded-xl overflow-hidden bg-muted relative group">
                  <img src={toPublicUrl(img.storage_path)} alt={img.alt ?? ""} className="w-full h-full object-cover" />
                  {img.is_cover && <Badge className="absolute top-2 left-2 bg-foreground text-background">Principale</Badge>}
                  {!img.is_cover && i === 0 && <Badge className="absolute top-2 left-2 bg-foreground text-background">Principale</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Localisation GPS
          </h3>
          <div className="aspect-[2/1] rounded-xl bg-gradient-to-br from-primary/10 via-secondary/10 to-primary/5 grid place-items-center text-sm text-muted-foreground border border-border">
            Carte interactive — {p.city_name ?? "—"}{p.address ? `, ${p.address}` : ""}
          </div>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h3 className="font-display font-semibold text-base mb-3">Statut de la propriété</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Visibilité</span>
              <Badge
                variant={statusVariant(p.status)}
                className={p.status === "published" ? "bg-primary/10 text-primary border-primary/20" : ""}
              >
                {statusLabel(p.status)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Chambres</span>
              <span className="font-semibold">{p.room_count}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Réservations</span>
              <span className="font-semibold">{p.booking_count}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-base mb-3">Aperçu public</h3>
          <div className="aspect-video rounded-xl overflow-hidden mb-3">
            <img src={coverUrl} alt={p.name} className="w-full h-full object-cover" />
          </div>
          <p className="font-semibold text-sm">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {p.city_name ?? "—"} · ⭐ {p.rating_avg != null ? p.rating_avg.toFixed(1) : "—"}
          </p>
          <Button asChild className="w-full mt-3" variant="outline">
            <Link to="/properties/$id" params={{ id: p.id }}>
              <ExternalLink className="h-4 w-4 mr-1.5" /> Voir la page
            </Link>
          </Button>
        </Card>

        <Button className="w-full gradient-primary text-primary-foreground font-semibold">
          Enregistrer les modifications
        </Button>
      </aside>
    </div>
  );
}
