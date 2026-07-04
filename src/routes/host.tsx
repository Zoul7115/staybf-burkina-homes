import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Home, BedDouble, Calendar, Receipt, Wallet, Crown, Star, MessageSquare, BarChart3, User, Settings } from "lucide-react";
import { DashboardShell, type NavItem, type ShellNotification } from "@/components/dashboard/DashboardShell";
import { useRouterState } from "@tanstack/react-router";
import { useHostProfile, useHostNotifications } from "@/lib/host";
import { useRealtimeNotifications, useRealtimeBookings } from "@/lib/realtime";
import { getInitials } from "@/lib/shared";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/host")({
  component: HostLayout,
});

export const hostNav: NavItem[] = [
  { to: "/host/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/host/property", label: "Mon Hébergement", icon: Home },
  { to: "/host/rooms", label: "Chambres", icon: BedDouble },
  { to: "/host/calendar", label: "Calendrier", icon: Calendar },
  { to: "/host/reservations", label: "Réservations", icon: Receipt },
  { to: "/host/revenue", label: "Revenus", icon: Wallet },
  { to: "/host/subscription", label: "Abonnement", icon: Crown },
  { to: "/host/reviews", label: "Avis", icon: Star },
  { to: "/host/messages", label: "Messages", icon: MessageSquare },
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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function HostLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const info = pageTitles[path] ?? { title: "Hôte" };

  const { profile } = useHostProfile();
  const { notifications } = useHostNotifications();

  // Resolve userId once for Realtime subscriptions
  const { data: userId } = useQuery({
    queryKey: ["auth", "userId"],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user?.id ?? null; },
    staleTime: Infinity,
  });

  // Realtime: notifications + bookings propagated instantly across the whole host shell
  useRealtimeNotifications(userId ?? null, "host");
  useRealtimeBookings(userId ?? null, "host");

  const displayName = profile?.full_name ?? profile?.display_name ?? "Hôte";
  const email = profile?.email ?? "";
  const avatar = getInitials(displayName);

  const shellNotifications: ShellNotification[] = notifications.map((n) => ({
    id: n.id,
    title: n.title ?? n.type,
    text: n.body ?? "",
    time: relativeTime(n.created_at),
    unread: !n.is_read,
  }));

  return (
    <DashboardShell
      navItems={hostNav}
      user={{ name: displayName, email, avatar, role: "Hôte" }}
      notifications={shellNotifications}
      title={info.title}
      breadcrumbs={info.bc}
    >
      <Outlet />
    </DashboardShell>
  );
}
