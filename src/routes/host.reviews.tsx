import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, Filter } from "lucide-react";
import { StatCard } from "@/components/dashboard/widgets";
import { ratingDistribution, recentReviews, hostStats } from "@/lib/staybf-host-data";

export const Route = createFileRoute("/host/reviews")({ component: HostReviewsPage });

function HostReviewsPage() {
  const [filter, setFilter] = useState<number | null>(null);
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Note moyenne" value={hostStats.rating.toFixed(2)} hint={`${hostStats.reviews} avis`} icon={Star} accent="secondary" />
        <StatCard label="Avis 5 étoiles" value="76%" delta="+4%" icon={Star} />
        <StatCard label="Taux de réponse" value="98%" hint="Excellent" icon={MessageSquare} accent="muted" />
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <Card className="p-5 h-fit">
          <h3 className="font-display font-semibold mb-4">Distribution</h3>
          <div className="space-y-2">
            {ratingDistribution.map((r) => (
              <button key={r.stars}
                onClick={() => setFilter(filter === r.stars ? null : r.stars)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg transition ${filter === r.stars ? "bg-primary/10" : "hover:bg-muted"}`}>
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
            <p className="text-sm text-muted-foreground">{filter ? `Filtré par ${filter}★` : "Tous les avis"}</p>
            {filter && <Button size="sm" variant="ghost" onClick={() => setFilter(null)}><Filter className="h-3.5 w-3.5 mr-1" /> Effacer</Button>}
          </div>
          {recentReviews.filter((r) => !filter || r.rating === filter).map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold shrink-0">{r.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.date}</p>
                    </div>
                    <div className="flex items-center gap-0.5 text-secondary">
                      {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                    </div>
                  </div>
                  <p className="text-sm mt-2">{r.text}</p>
                  <details className="mt-3">
                    <summary className="text-xs font-semibold text-primary cursor-pointer hover:underline">Répondre</summary>
                    <div className="mt-2 space-y-2">
                      <Textarea placeholder="Merci pour votre avis..." rows={2} />
                      <Button size="sm" className="gradient-primary text-primary-foreground">Publier la réponse</Button>
                    </div>
                  </details>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
