import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Check, Trash2, Flag } from "lucide-react";
import { adminReviews } from "@/lib/staybf-admin-data";

export const Route = createFileRoute("/admin/reviews")({ component: AdminReviewsPage });

function AdminReviewsPage() {
  const [items, setItems] = useState(adminReviews);
  const set = (id: string, s: "approved" | "removed") =>
    setItems((a) => a.map((r) => r.id === id ? { ...r, status: s } : r));

  const filt = (s: string) => items.filter((r) => s === "all" || r.status === s);

  return (
    <Tabs defaultValue="reported" className="space-y-4">
      <TabsList>
        <TabsTrigger value="reported">Signalés ({filt("reported").length})</TabsTrigger>
        <TabsTrigger value="approved">Approuvés ({filt("approved").length})</TabsTrigger>
        <TabsTrigger value="removed">Supprimés ({filt("removed").length})</TabsTrigger>
      </TabsList>

      {["reported", "approved", "removed"].map((s) => (
        <TabsContent key={s} value={s}>
          <div className="space-y-3">
            {filt(s).map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-semibold">{r.author}</p>
                      <div className="flex text-secondary">
                        {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
                      </div>
                      <span className="text-xs text-muted-foreground">· {r.property}</span>
                      {s === "reported" && <span className="text-[11px] font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full"><Flag className="h-3 w-3 inline mr-1" /> Signalé</span>}
                    </div>
                    <p className="text-sm">{r.text}</p>
                    <p className="text-xs text-muted-foreground mt-2">{r.date}</p>
                  </div>
                  {s === "reported" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => set(r.id, "approved")}><Check className="h-4 w-4 mr-1" /> Approuver</Button>
                      <Button size="sm" variant="outline" onClick={() => set(r.id, "removed")}><Trash2 className="h-4 w-4 mr-1" /> Retirer</Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
            {filt(s).length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">Aucun avis.</Card>}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
