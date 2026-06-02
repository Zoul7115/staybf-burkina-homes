import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Activity, Server, KeyRound } from "lucide-react";
import { adminRoles, adminPermissions, adminAuditLogs } from "@/lib/staybf-admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/roles")({ component: AdminRolesPage });

function AdminRolesPage() {
  return (
    <Tabs defaultValue="roles" className="space-y-4">
      <TabsList>
        <TabsTrigger value="roles"><ShieldCheck className="h-4 w-4 mr-1.5" /> Rôles</TabsTrigger>
        <TabsTrigger value="permissions"><KeyRound className="h-4 w-4 mr-1.5" /> Permissions</TabsTrigger>
        <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-1.5" /> Audit</TabsTrigger>
        <TabsTrigger value="system"><Server className="h-4 w-4 mr-1.5" /> Système</TabsTrigger>
      </TabsList>

      <TabsContent value="roles">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminRoles.map((r) => (
            <Card key={r.id} className="p-5">
              <div className={cn("h-10 w-10 rounded-xl grid place-items-center mb-3",
                r.color === "primary" ? "bg-primary text-primary-foreground" :
                r.color === "secondary" ? "bg-secondary text-secondary-foreground" : "bg-muted")}>
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-display font-semibold">{r.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{r.users} utilisateurs · {r.permissions} permissions</p>
              <Button variant="outline" size="sm" className="w-full mt-4">Configurer</Button>
            </Card>
          ))}
          <Card className="p-5 border-dashed grid place-items-center text-center min-h-48">
            <Button variant="ghost">+ Nouveau rôle</Button>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="permissions">
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Matrice de permissions</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {adminRoles.map((r) => <TableHead key={r.id} className="text-center">{r.name}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminPermissions.flatMap((g) => g.items.map((item) => (
                <TableRow key={`${g.group}-${item}`}>
                  <TableCell className="text-sm">
                    <span className="text-xs text-muted-foreground">{g.group} ·</span> {item}
                  </TableCell>
                  {adminRoles.map((r) => (
                    <TableCell key={r.id} className="text-center">
                      <Switch defaultChecked={r.name === "Super Admin" || (Math.random() > 0.5)} />
                    </TableCell>
                  ))}
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      <TabsContent value="audit">
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Input placeholder="Filtrer les logs..." className="max-w-sm" />
            <Button variant="outline" size="sm">Exporter</Button>
          </div>
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
              {adminAuditLogs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm font-medium">{l.actor}</TableCell>
                  <TableCell className="text-sm">{l.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.target}</TableCell>
                  <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
