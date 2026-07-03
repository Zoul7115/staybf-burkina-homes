import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, BedDouble, ImagePlus } from "lucide-react";
import type React from "react";
import { StatusBadge, EmptyState } from "@/components/dashboard/widgets";
import { useHostRooms, roomImageUrl } from "@/lib/host";
import type { RoomFormParams } from "@/lib/host/useHostRooms";
import { PLACEHOLDER_IMG } from "@/lib/shared";
import type { HostRoomDetail } from "@/lib/host";

export const Route = createFileRoute("/host/rooms")({ component: HostRoomsPage });

// ── Helpers ──────────────────────────────────────────────────

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function roomStatusKey(status: string): string {
  if (status === "active") return "active";
  if (status === "paused" || status === "archived") return "suspended";
  return "pending";
}

function bedsSummary(beds: { type: string; count: number }[]): string {
  if (!beds || beds.length === 0) return "—";
  return beds
    .map((b) => `${b.count} ${b.type}`)
    .join(", ");
}

function coverUrl(room: HostRoomDetail): string {
  const sorted = [...room.images].sort((a, b) => a.position - b.position);
  const cover = sorted.find((img) => img.is_cover) ?? sorted[0];
  return cover ? roomImageUrl(cover.storage_path) : PLACEHOLDER_IMG;
}

// ── Skeletons ────────────────────────────────────────────────

function RoomsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-32" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-28" />
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

function HostRoomsPage() {
  const { rooms, propertyId, loading, error, createRoom, updateRoom, saving, saveError } = useHostRooms();

  if (loading) return <RoomsSkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement des chambres : {error}
      </Card>
    );
  }

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={BedDouble}
        title="Aucune chambre"
        description="Vous n'avez pas encore de chambre. Ajoutez votre première chambre pour commencer à recevoir des réservations."
        action={
          <RoomFormDialog
            propertyId={propertyId}
            onSubmit={createRoom}
            saving={saving}
            saveError={saveError}
            trigger={
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> Nouvelle chambre
              </Button>
            }
          />
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rooms.length} type{rooms.length > 1 ? "s" : ""} de chambre{rooms.length > 1 ? "s" : ""}</p>
        <RoomFormDialog
          propertyId={propertyId}
          onSubmit={createRoom}
          saving={saving}
          saveError={saveError}
          trigger={
            <Button className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Nouvelle chambre
            </Button>
          }
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((r) => (
          <RoomCard
            key={r.id}
            room={r}
            onEdit={(params) => updateRoom(r.id, params)}
            saving={saving}
            saveError={saveError}
          />
        ))}
      </div>
    </div>
  );
}

// ── Room card ─────────────────────────────────────────────────

function RoomCard({
  room: r,
  onEdit,
  saving,
  saveError,
}: {
  room: HostRoomDetail;
  onEdit: (params: Omit<RoomFormParams, "propertyId">) => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  const imgUrl = coverUrl(r);
  const hasCover = r.images.length > 0;

  return (
    <Card className="overflow-hidden hover:shadow-elevated transition-shadow">
      <div className="aspect-video bg-gradient-to-br from-primary/15 to-secondary/15 relative overflow-hidden">
        {hasCover ? (
          <img src={imgUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">
            <BedDouble className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display font-semibold truncate">{r.name}</h3>
            <p className="text-xs text-muted-foreground capitalize">{r.type}</p>
          </div>
          <StatusBadge status={roomStatusKey(r.status)} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {r.max_guests} pers
          </span>
          {r.beds.length > 0 && (
            <>
              <span>·</span>
              <span>{bedsSummary(r.beds)}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground">
          <span>
            {r.booking_count > 0 ? `${r.booking_count} réserv.` : "—"}
          </span>
          <span>·</span>
          <span>
            {r.open_nights_next_30 > 0
              ? `${r.open_nights_next_30} nuits dispo (30j)`
              : "—"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <p className="font-display font-bold text-lg">
            {fmtFCFA(r.base_price_fcfa)}
            <span className="text-xs font-normal text-muted-foreground">/nuit</span>
          </p>
          <div className="flex items-center gap-1">
            <RoomFormDialog
              room={r}
              onSubmit={onEdit}
              saving={saving}
              saveError={saveError}
              trigger={
                <Button size="icon" variant="ghost">
                  <Pencil className="h-4 w-4" />
                </Button>
              }
            />
            <Button size="icon" variant="ghost" disabled title="Suppression non disponible côté client (GRANT INSERT/UPDATE uniquement)">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        {r.images.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {r.images.slice(0, 5).map((img) => (
              <div key={img.id} className="h-10 w-10 rounded-md overflow-hidden shrink-0 bg-muted">
                <img
                  src={roomImageUrl(img.storage_path)}
                  alt={img.alt ?? ""}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {r.images.length > 5 && (
              <div className="h-10 w-10 rounded-md bg-muted shrink-0 grid place-items-center text-[10px] text-muted-foreground font-semibold">
                +{r.images.length - 5}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Room form dialog (create + edit) ─────────────────────────

function RoomFormDialog({
  trigger,
  room,
  propertyId,
  onSubmit,
  saving,
  saveError,
}: {
  trigger: React.ReactNode;
  room?: HostRoomDetail;
  propertyId?: string | null;
  onSubmit: (params: RoomFormParams | Omit<RoomFormParams, "propertyId">) => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  const isEdit = !!room;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(room?.name ?? "");
  const [type, setType] = useState(room?.type ?? "double");
  const [capacity, setCapacity] = useState(room?.max_guests ?? 2);
  const [price, setPrice] = useState(room?.base_price_fcfa ?? 50000);
  const [localError, setLocalError] = useState<string | null>(null);

  const effectivePropId = propertyId ?? room?.property_id ?? null;

  async function handleSubmit() {
    if (!name.trim()) { setLocalError("Le nom est requis."); return; }
    if (!effectivePropId && !isEdit) { setLocalError("Aucune propriété trouvée."); return; }
    setLocalError(null);
    try {
      if (isEdit) {
        await (onSubmit as (p: Omit<RoomFormParams, "propertyId">) => Promise<void>)({ name: name.trim(), type, max_guests: capacity, base_price_fcfa: price });
      } else {
        await (onSubmit as (p: RoomFormParams) => Promise<void>)({ propertyId: effectivePropId!, name: name.trim(), type, max_guests: capacity, base_price_fcfa: price });
      }
      setOpen(false);
    } catch {
      // saveError surfaces the message from the hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLocalError(null); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Modifier la chambre" : "Nouvelle chambre"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Suite Junior" className="mt-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Capacité</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(+e.target.value)} className="mt-1.5" />
            </div>
            <div className="col-span-2">
              <Label>Prix (FCFA)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(+e.target.value)} className="mt-1.5" />
            </div>
          </div>
          {!isEdit && (
            <Button variant="outline" className="w-full" disabled title="Upload de photos non disponible sans Edge Function">
              <ImagePlus className="h-4 w-4 mr-1.5" /> Ajouter photos
            </Button>
          )}
          {(localError ?? saveError) && (
            <p className="text-xs text-destructive">{localError ?? saveError}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            className="gradient-primary text-primary-foreground"
            disabled={saving || !name.trim()}
            onClick={handleSubmit}
          >
            {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
