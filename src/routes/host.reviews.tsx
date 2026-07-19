import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MessageSquare, Filter } from "lucide-react";
import { StatCard, EmptyState } from "@/components/dashboard/widgets";
import { useHostReviews } from "@/lib/host";
import { getInitials } from "@/lib/shared";

export const Route = createFileRoute("/host/reviews")({ component: HostReviewsPage });

// ── Helpers ──────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ── Skeleton ──────────────────────────────────────────────────

function ReviewsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <Card className="p-5 h-fit space-y-2">
          <Skeleton className="h-5 w-32 mb-2" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </Card>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <div className="flex gap-4">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

function HostReviewsPage() {
  const { data, loading, error, replyToReview, replying, replyError } = useHostReviews();
  const [filter, setFilter] = useState<number | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  if (loading) return <ReviewsSkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement des avis : {error}
      </Card>
    );
  }

  if (!data || data.totalCount === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Aucun avis"
        description="Vous n'avez pas encore reçu d'avis publiés. Ils apparaîtront ici dès que des voyageurs en laisseront."
      />
    );
  }

  const filtered = filter ? data.reviews.filter((r) => r.overallRating === filter) : data.reviews;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard
          label="Note moyenne"
          value={data.avgRating !== null ? data.avgRating.toFixed(2) : "—"}
          hint={`${data.totalCount} avis`}
          icon={Star}
          accent="secondary"
        />
        <StatCard
          label="Avis 5 étoiles"
          value={data.fiveStarPct !== null ? `${data.fiveStarPct}%` : "—"}
          icon={Star}
        />
        <StatCard
          label="Avis reçus"
          value={String(data.totalCount)}
          hint="Publiés"
          icon={MessageSquare}
          accent="muted"
        />
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <Card className="p-5 h-fit">
          <h3 className="font-display font-semibold mb-4">Distribution</h3>
          <div className="space-y-2">
            {data.distribution.map((r) => (
              <button
                key={r.stars}
                onClick={() => setFilter(filter === r.stars ? null : r.stars)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg transition ${
                  filter === r.stars ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span className="text-xs font-semibold w-6">{r.stars}★</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${r.pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{r.count}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filter ? `Filtré par ${filter}★` : "Tous les avis"}
            </p>
            {filter && (
              <Button size="sm" variant="ghost" onClick={() => setFilter(null)}>
                <Filter className="h-3.5 w-3.5 mr-1" /> Effacer
              </Button>
            )}
          </div>

          {filtered.length === 0 && (
            <Card className="p-10 text-center text-muted-foreground text-sm">
              Aucun avis pour cette note.
            </Card>
          )}

          {filtered.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold shrink-0 text-sm">
                  {getInitials(r.reviewerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold">{r.reviewerName ?? "Voyageur"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.publishedAt ? fmtDate(r.publishedAt) : fmtDate(r.createdAt)}
                        {r.propertyName && ` · ${r.propertyName}`}
                        {r.roomName && ` · ${r.roomName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 text-secondary">
                      {Array.from({ length: r.overallRating }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                  </div>

                  <p className="text-sm mt-2">{r.body}</p>

                  {r.reply && (
                    <div className="mt-3 pl-3 border-l-2 border-primary/30">
                      <p className="text-xs font-semibold text-primary mb-1">Votre réponse</p>
                      <p className="text-sm text-muted-foreground">{r.reply.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">{fmtDate(r.reply.createdAt)}</p>
                    </div>
                  )}

                  {!r.reply && (
                    <div className="mt-3">
                      {replyingToId === r.id ? (
                        <div className="space-y-2">
                          <Textarea
                            placeholder="Merci pour votre avis..."
                            rows={2}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                          />
                          {replyError && <p className="text-xs text-destructive">{replyError}</p>}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="gradient-primary text-primary-foreground"
                              disabled={replying || !replyText.trim()}
                              onClick={async () => {
                                await replyToReview(r.id, replyText);
                                setReplyingToId(null);
                                setReplyText("");
                              }}
                            >
                              {replying ? "Envoi…" : "Publier la réponse"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setReplyingToId(null)}>
                              Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={() => { setReplyingToId(r.id); setReplyText(""); }}
                        >
                          Répondre
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
