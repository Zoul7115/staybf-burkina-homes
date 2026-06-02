import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Home, BedDouble, Calendar, Receipt, Wallet, Crown, Star, MessageSquare, BarChart3, User, Settings } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { host, hostNotifications } from "@/lib/staybf-host-data";
import { useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/host")({
  component: HostLayout,
});

export const hostNav: NavItem[] = [
  { to: "/host/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/host/property", label: "Mon Hébergement", icon: Home },
  { to: "/host/rooms", label: "Chambres", icon: BedDouble },
  { to: "/host/calendar", label: "Calendrier", icon: Calendar },
  { to: "/host/reservations", label: "Réservations", icon: Receipt, badge: 5 },
  { to: "/host/revenue", label: "Revenus", icon: Wallet },
  { to: "/host/subscription", label: "Abonnement", icon: Crown },
  { to: "/host/reviews", label: "Avis", icon: Star },
  { to: "/host/messages", label: "Messages", icon: MessageSquare, badge: 3 },
  { to: "/host/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/host/profile", label: "Profil", icon: User },
  { to: "/host/settings", label: "Paramètres", icon: Settings },
];

const pageTitles: Record<string, { title: string; bc?: { label: string; to?: string }[] }> = {
  "/host/dashboard": { title: "Vue d'ensemble", bc: [{ label: "Hôte" }, { label: "Dashboard" }] },
  "/host/property": { title: "Mon Hébergement", bc: [{ label: "Hôte" }, { label: "Hébergement" }] },
  "/host/rooms": { title: "Chambres", bc: [{ label: "Hôte" }, { label: "Chambres" }] },
  "/host/calendar": { title: "Calendrier", bc: [{ label: "Hôte" }, { label: "Calendrier" }] },
  "/host/reservations": { title: "Réservations", bc: [{ label: "Hôte" }, { label: "Réservations" }] },
  "/host/revenue": { title: "Revenus", bc: [{ label: "Hôte" }, { label: "Revenus" }] },
  "/host/subscription": { title: "Abonnement", bc: [{ label: "Hôte" }, { label: "Abonnement" }] },
  "/host/reviews": { title: "Avis", bc: [{ label: "Hôte" }, { label: "Avis" }] },
  "/host/messages": { title: "Messagerie", bc: [{ label: "Hôte" }, { label: "Messages" }] },
  "/host/analytics": { title: "Analytics", bc: [{ label: "Hôte" }, { label: "Analytics" }] },
  "/host/profile": { title: "Profil hôte", bc: [{ label: "Hôte" }, { label: "Profil" }] },
  "/host/settings": { title: "Paramètres", bc: [{ label: "Hôte" }, { label: "Paramètres" }] },
};

function HostLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const info = pageTitles[path] ?? { title: "Hôte" };
  return (
    <DashboardShell
      navItems={hostNav}
      user={{ name: host.name, email: host.email, avatar: host.avatar, role: "Hôte" }}
      notifications={hostNotifications}
      title={info.title}
      breadcrumbs={info.bc}
    >
      <Outlet />
    </DashboardShell>
  );
}
