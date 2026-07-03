import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Building2, Receipt, UserCog, Crown, CreditCard,
  Wallet, Star, MapPin, LifeBuoy, Bell, FileBarChart, Settings, ShieldCheck,
} from "lucide-react";
import { DashboardShell, type NavItem, type ShellNotification } from "@/components/dashboard/DashboardShell";
import { supabase } from "@/lib/supabase/client";
import { getInitials } from "@/lib/shared";

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

type AdminUser = { name: string; email: string; avatar: string; role: string };

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const info = titles[path] ?? { title: "Admin", bc: [{ label: "Admin" }] };

  const [adminUser, setAdminUser] = useState<AdminUser>({
    name: "Admin",
    email: "",
    avatar: "AD",
    role: "admin",
  });
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [profileRes, rolesRes] = await Promise.all([
        (supabase as any).from("profiles").select("full_name, display_name, email").eq("id", user.id).maybeSingle(),
        (supabase as any).from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
      ]);

      const p = profileRes.data;
      const name = p?.full_name ?? p?.display_name ?? user.email ?? "Admin";
      setAdminUser({
        name,
        email: p?.email ?? user.email ?? "",
        avatar: getInitials(name),
        role: rolesRes.data?.role ?? "admin",
      });
    }

    async function loadNotifications() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("notifications")
        .select("id, title, body, type, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!data) return;
      setNotifications(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any[]).map((n) => ({
          id: n.id,
          title: n.title ?? "Notification",
          text: n.body ?? "",
          time: new Date(n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
          unread: !n.is_read,
        }))
      );
    }

    loadUser();
    loadNotifications();
  }, []);

  return (
    <DashboardShell
      navItems={adminNav}
      user={adminUser}
      notifications={notifications}
      title={info.title}
      breadcrumbs={info.bc}
    >
      <Outlet />
    </DashboardShell>
  );
}
