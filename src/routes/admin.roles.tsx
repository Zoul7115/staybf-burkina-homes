import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Activity, Server, KeyRound } from "lucide-react";
import { useAdminRoles } from "@/lib/admin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/roles")({ component: AdminRolesPage });

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-primary text-primary-foreground",
  admin: "bg-secondary text-secondary-foreground",
  host: "bg-muted text-muted-foreground",
  traveler: "bg-muted text-muted-foreground",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminRolesPage() {
  const { roleCounts, auditLogs, loading, error } = useAdminRoles();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-24 w-full" /></Card>)}
        </div>
        <Card className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  return (
    <Tabs defaultValue="roles" className="space-y-4">
      <TabsList>
        <TabsTrigger value="roles"><ShieldCheck className="h-4 w-4 mr-1.5" /> Rôles</TabsTrigger>
        <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-1.5" /> Audit</TabsTrigger>
        <TabsTrigger value="system"><Server className="h-4 w-4 mr-1.5" /> Système</TabsTrigger>
      </TabsList>

      <TabsContent value="roles">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roleCounts.map((r) => (
            <Card key={r.role} className="p-5">
              <div className={cn("h-10 w-10 rounded-xl grid place-items-center mb-3", ROLE_COLORS[r.role] ?? "bg-muted text-muted-foreground")}>
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-display font-semibold capitalize">{r.role.replace("_", " ")}</h3>
              <p className="text-xs text-muted-foreground mt-1">{r.usersCount} utilisateur(s)</p>
              <Button variant="outline" size="sm" className="w-full mt-4">Configurer</Button>
            </Card>
          ))}
          {roleCounts.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground col-span-3">Aucun rôle trouvé.</Card>
          )}
          <Card className="p-5 border-dashed grid place-items-center text-center min-h-48">
            <Button variant="ghost" disabled>+ Nouveau rôle</Button>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="audit">
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filtrer les logs..." className="max-w-sm" readOnly />
            <Button variant="outline" size="sm">Exporter</Button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="p-10 text-center text-xs text-muted-foreground">Aucun log d'audit.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Cible</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Quand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm font-medium">
                      {l.actorName ?? l.actorEmail ?? "Système"}
                    </TableCell>
                    <TableCell className="text-sm">{l.actionType}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.targetTable ? `${l.targetTable}${l.targetId ? `#${l.targetId.slice(0, 8)}` : ""}` : l.notes ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.ipAddress ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(l.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="system">
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Uptime API</p>
            <p className="font-display font-bold text-2xl mt-1">99.98%</p>
            <p className="text-xs text-primary mt-1">● Opérationnel</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Requêtes API (24h)</p>
            <p className="font-display font-bold text-2xl mt-1">1.2M</p>
            <p className="text-xs text-muted-foreground mt-1">~14 req/sec</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Latence p95</p>
            <p className="font-display font-bold text-2xl mt-1">142ms</p>
            <p className="text-xs text-secondary mt-1">⚠ Légère hausse</p>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
