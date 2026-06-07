import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapPin, Camera, ExternalLink, CheckCircle2, Plus } from "lucide-react";
import { hostProperty } from "@/lib/staybf-host-data";
import type { PropertyDetail } from "@/lib/staybf-property-data";

export const Route = createFileRoute("/host/property")({ component: HostPropertyPage });

const LOAD_TIMEOUT_MS = 8_000;

function fetchHostProperties(_userId: string): Promise<PropertyDetail | null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // TODO: remplacer par un appel API réel (Supabase) filtré sur host_id
      resolve(hostProperty);
    }, 600);
  });
}

function getCurrentUser() {
  // TODO: remplacer par auth réel (Supabase / Lovable Cloud)
  return { user: { id: "host-demo-001" } };
}

function HostPropertyPage() {
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setError("Le chargement a pris trop de temps. Veuillez réessayer.");
        setLoading(false);
      }
    }, LOAD_TIMEOUT_MS);

    async function load() {
      try {
        const userData = getCurrentUser();
        const userId = userData.user?.id;

        if (!userId) {
          if (!cancelled) {
            setProperty(null);
            setLoading(false);
          }
          clearTimeout(timeoutId);
          return;
        }

        const data = await fetchHostProperties(userId);

        if (!cancelled) {
          console.log("CURRENT USER:", userData.user?.id);
          console.log("HOST PROPERTIES:", data);
          setProperty(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erreur chargement propriété:", err);
          setError("Impossible de charger vos hébergements.");
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Chargement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive text-sm">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Vous n&apos;avez encore aucun hébergement.</p>
        <Button className="gradient-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-1.5" /> Créer mon premier hébergement
        </Button>
      </div>
    );
  }

  const p = property;
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-lg">Informations</h3>
            <Badge className="bg-primary/10 text-primary border border-primary/20">Publié</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Nom de l&apos;hébergement</Label><Input defaultValue={p.name} className="mt-1.5" /></div>
            <div><Label>Ville</Label><Input defaultValue={p.city} className="mt-1.5" /></div>
            <div><Label>Quartier</Label><Input defaultValue={p.neighborhood} className="mt-1.5" /></div>
            <div className="sm:col-span-2">
              <Label>Adresse complète</Label>
              <Input defaultValue={`Avenue Yennenga, ${p.neighborhood}, ${p.city}, Burkina Faso`} className="mt-1.5" />
            </div>
            <div><Label>Latitude</Label><Input defaultValue="12.3686" className="mt-1.5" /></div>
            <div><Label>Longitude</Label><Input defaultValue="-1.5275" className="mt-1.5" /></div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold text-lg">Description</h3>
          <Textarea rows={5} defaultValue={p.description.overview} />
          <p className="text-xs text-muted-foreground">Présentez votre hébergement de manière claire et accueillante.</p>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-lg mb-4">Équipements</h3>
          <div className="flex flex-wrap gap-2">
            {p.amenities.map((a) => (
              <Badge key={a.key} variant="outline" className="rounded-full px-3 py-1.5 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1 text-primary" /> {a.label}
              </Badge>
            ))}
            <Button size="sm" variant="outline" className="rounded-full h-auto py-1.5">+ Ajouter</Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg">Photos</h3>
            <Button size="sm" variant="outline"><Camera className="h-4 w-4 mr-1.5" /> Ajouter</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {p.images.slice(0, 8).map((src, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden bg-muted relative group">
                <img src={src} alt="" className="w-full h-full object-cover" />
                {i === 0 && <Badge className="absolute top-2 left-2 bg-foreground text-background">Principale</Badge>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Localisation GPS</h3>
          <div className="aspect-[2/1] rounded-xl bg-gradient-to-br from-primary/10 via-secondary/10 to-primary/5 grid place-items-center text-sm text-muted-foreground border border-border">
            Carte interactive — {p.city}, {p.neighborhood}
          </div>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h3 className="font-display font-semibold text-base mb-3">Statut de la propriété</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Visibilité</span><Badge className="bg-primary/10 text-primary border-primary/20">Publié</Badge></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Vérification</span><Badge className="bg-primary/10 text-primary border-primary/20">Vérifié</Badge></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Complétion</span><span className="font-semibold">94%</span></div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: "94%" }} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-base mb-3">Aperçu public</h3>
          <div className="aspect-video rounded-xl overflow-hidden mb-3">
            <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
          </div>
          <p className="font-semibold text-sm">{p.name}</p>
          <p className="text-xs text-muted-foreground">{p.city} · ⭐ {p.rating}</p>
          <Button asChild className="w-full mt-3" variant="outline">
            <Link to="/properties/$id" params={{ id: p.id }}><ExternalLink className="h-4 w-4 mr-1.5" /> Voir la page</Link>
          </Button>
        </Card>

        <Button className="w-full gradient-primary text-primary-foreground font-semibold">Enregistrer les modifications</Button>
      </aside>
    </div>
  );
}
