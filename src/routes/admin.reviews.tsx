import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Check, Trash2, Flag } from "lucide-react";
import { useAdminReviews } from "@/lib/admin";

export const Route = createFileRoute("/admin/reviews")({ component: AdminReviewsPage });

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function AdminReviewsPage() {
  const { reviews, loading, error, approveReview, removeReview } = useAdminReviews();
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  async function handleApprove(id: string) {
    setActionErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      await approveReview(id);
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Erreur" }));
    }
  }

  async function handleRemove(id: string) {
    setActionErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      await removeReview(id);
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Erreur" }));
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-20 w-full" /></Card>)}
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  const reported = reviews.filter((r) => r.status === "flagged" || r.status === "under_review");
  const approved = reviews.filter((r) => r.status === "published");
  const removed = reviews.filter((r) => r.status === "removed");

  const groups = [
    { key: "reported", label: "Signalés", items: reported },
    { key: "approved", label: "Approuvés", items: approved },
    { key: "removed", label: "Supprimés", items: removed },
  ];

  return (
    <Tabs defaultValue="reported" className="space-y-4">
      <TabsList>
        {groups.map((g) => (
          <TabsTrigger key={g.key} value={g.key}>
            {g.label} ({g.items.length})
          </TabsTrigger>
        ))}
      </TabsList>

      {groups.map((g) => (
        <TabsContent key={g.key} value={g.key}>
          <div className="space-y-3">
            {g.items.map((r) => (
              <Card key={r.id} className="p-5">
                {actionErrors[r.id] && (
                  <p className="text-xs text-destructive mb-2">{actionErrors[r.id]}</p>
                )}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-semibold">{r.reviewerName ?? "—"}</p>
                      <div className="flex text-secondary">
                        {Array.from({ length: Math.min(r.overallRating, 5) }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </div>
                      {r.propertyName && (
                        <span className="text-xs text-muted-foreground">· {r.propertyName}</span>
                      )}
                      {g.key === "reported" && (
                        <span className="text-[11px] font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                          <Flag className="h-3 w-3 inline mr-1" /> Signalé
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{r.body ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-2">{fmtDate(r.createdAt)}</p>
                  </div>
                  {g.key === "reported" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => handleApprove(r.id)}>
                        <Check className="h-4 w-4 mr-1" /> Approuver
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRemove(r.id)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Retirer
                      </Button>
                    </div>
                  )}
                  {g.key === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => handleRemove(r.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Retirer
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {g.items.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">Aucun avis.</Card>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
