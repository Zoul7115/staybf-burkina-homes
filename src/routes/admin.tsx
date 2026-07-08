import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Building2, Receipt, UserCog, Crown, CreditCard,
  Wallet, Star, MapPin, LifeBuoy, Bell, FileBarChart, Settings, ShieldCheck,
} from "lucide-react";
import { DashboardShell, type NavItem, type ShellNotification } from "@/components/dashboard/DashboardShell";
import { useAdminProfile, useAdminNotifications } from "@/lib/admin";
import { useRealtimeNotifications } from "@/lib/realtime";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

export const adminNav: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/hosts", label: "Hôtes", icon: Users },
  { to: "/admin/properties", label: "Propriétés", icon: Building2 },
  { to: "/admin/reservations", label: "Réservations", icon: Receipt },
  { to: "/admin/travelers", label: "Voyageurs", icon: UserCog },
  { to: "/admin/subscriptions", label: "Abonnements", icon: Crown },
  { to: "/admin/payments", label: "Paiements", icon: CreditCard },
  { to: "/admin/revenue", label: "Revenus", icon: Wallet },
  { to: "/admin/reviews", label: "Avis", icon: Star },
  { to: "/admin/cities", label: "Villes", icon: MapPin },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/reports", label: "Rapports", icon: FileBarChart },
  { to: "/admin/roles", label: "Rôles & Sécurité", icon: ShieldCheck },
  { to: "/admin/settings", label: "Paramètres", icon: Settings },
];

const titles: Record<string, { title: string; bc: { label: string; to?: string }[] }> = {
  "/admin/dashboard": { title: "Centre de contrôle", bc: [{ label: "Admin" }, { label: "Dashboard" }] },
  "/admin/hosts": { title: "Gestion des hôtes", bc: [{ label: "Admin" }, { label: "Hôtes" }] },
  "/admin/properties": { title: "Modération propriétés", bc: [{ label: "Admin" }, { label: "Propriétés" }] },
  "/admin/reservations": { title: "Réservations", bc: [{ label: "Admin" }, { label: "Réservations" }] },
  "/admin/travelers": { title: "Voyageurs", bc: [{ label: "Admin" }, { label: "Voyageurs" }] },
  "/admin/subscriptions": { title: "Abonnements", bc: [{ label: "Admin" }, { label: "Abonnements" }] },
  "/admin/payments": { title: "Paiements", bc: [{ label: "Admin" }, { label: "Paiements" }] },
  "/admin/revenue": { title: "Centre de revenus", bc: [{ label: "Admin" }, { label: "Revenus" }] },
  "/admin/reviews": { title: "Modération des avis", bc: [{ label: "Admin" }, { label: "Avis" }] },
  "/admin/cities": { title: "Gestion des villes", bc: [{ label: "Admin" }, { label: "Villes" }] },
  "/admin/support": { title: "Centre de support", bc: [{ label: "Admin" }, { label: "Support" }] },
  "/admin/notifications": { title: "Campagnes & notifications", bc: [{ label: "Admin" }, { label: "Notifications" }] },
  "/admin/reports": { title: "Centre de reporting", bc: [{ label: "Admin" }, { label: "Rapports" }] },
  "/admin/roles": { title: "Rôles & permissions", bc: [{ label: "Admin" }, { label: "Sécurité" }] },
  "/admin/settings": { title: "Paramètres plateforme", bc: [{ label: "Admin" }, { label: "Paramètres" }] },
};

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const info = titles[path] ?? { title: "Admin", bc: [{ label: "Admin" }] };

  const { profile } = useAdminProfile();
  const { notifications } = useAdminNotifications();

  // Resolve current user id for Realtime subscription
  const { data: userId } = useQuery({
    queryKey: ["auth", "userId"],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user?.id ?? null; },
    staleTime: Infinity,
  });

  useRealtimeNotifications(userId ?? null, "admin");

  const shellNotifications: ShellNotification[] = notifications.map((n) => ({
    id: n.id,
    title: n.title ?? "Notification",
    text: n.body ?? "",
    time: new Date(n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    unread: !n.is_read,
  }));

  return (
    <DashboardShell
      navItems={adminNav}
      user={profile}
      notifications={shellNotifications}
      title={info.title}
      breadcrumbs={info.bc}
    >
      <Outlet />
    </DashboardShell>
  );
}
