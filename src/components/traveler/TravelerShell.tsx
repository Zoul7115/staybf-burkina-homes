import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, CalendarCheck, Heart, MessageSquare, User, Settings,
  Bell, Menu, X, Leaf, LogOut, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { traveler, notifications } from "@/lib/staybf-traveler-data";

const navItems = [
  { to: "/traveler/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/traveler/bookings", label: "Mes Réservations", icon: CalendarCheck },
  { to: "/traveler/favorites", label: "Mes Favoris", icon: Heart },
  { to: "/traveler/messages", label: "Messages", icon: MessageSquare, badge: 3 },
  { to: "/traveler/profile", label: "Profil", icon: User },
  { to: "/traveler/settings", label: "Paramètres", icon: Settings },
] as const;

const mobileNav = navItems.slice(0, 5);

export function TravelerShell({ children, title }: { children: ReactNode; title: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifications.filter((n) => n.unread).length;

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-background sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2 px-6 h-16 border-b border-border">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
            <Leaf className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="font-display font-bold text-xl">Stay<span className="text-secondary">BF</span></span>
        </Link>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((it) => {
            const Icon = it.icon;
            const active = path === it.to;
            return (
              <Link
                key={it.to} to={it.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{it.label}</span>
                {"badge" in it && it.badge ? (
                  <span className={cn("text-[10px] font-bold rounded-full h-5 min-w-5 px-1 grid place-items-center",
                    active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground")}>
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-sm shrink-0">
              {traveler.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{traveler.firstName} {traveler.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">{traveler.email}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Déconnexion">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border h-16 flex items-center gap-3 px-4 lg:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex items-center gap-2 px-6 h-16 border-b border-border">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
                  <Leaf className="h-5 w-5" />
                </span>
                <span className="font-display font-bold text-xl">Stay<span className="text-secondary">BF</span></span>
              </div>
              <nav className="p-4 space-y-1">
                {navItems.map((it) => {
                  const Icon = it.icon;
                  const active = path === it.to;
                  return (
                    <Link key={it.to} to={it.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
                        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                      )}>
                      <Icon className="h-4 w-4" /> {it.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="lg:hidden flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
              <Leaf className="h-4 w-4" />
            </span>
          </Link>

          <h1 className="font-display font-semibold text-lg md:text-xl truncate flex-1">{title}</h1>

          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Rechercher">
            <Link to="/search"><Search className="h-5 w-5" /></Link>
          </Button>

          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-card border border-border shadow-elevated z-50 overflow-hidden animate-scale-in">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <p className="font-semibold text-sm">Notifications</p>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNotifOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="max-h-96 overflow-y-auto">
                    {notifications.map((n) => (
                      <li key={n.id} className={cn("px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50", n.unread && "bg-primary/5")}>
                        <div className="flex items-start gap-2">
                          <span className={cn("h-2 w-2 rounded-full mt-1.5", n.unread ? "bg-primary" : "bg-transparent")} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{n.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{n.text}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>

          <Link to="/traveler/profile" className="hidden sm:flex h-9 w-9 rounded-full gradient-primary text-primary-foreground items-center justify-center font-bold text-sm">
            {traveler.avatar}
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-24 lg:pb-8 animate-fade-in">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t border-border h-16 grid grid-cols-5">
          {mobileNav.map((it) => {
            const Icon = it.icon;
            const active = path === it.to;
            return (
              <Link key={it.to} to={it.to}
                className={cn("flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative",
                  active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-full px-1">{it.label.split(" ")[0]}</span>
                {"badge" in it && it.badge ? (
                  <Badge className="absolute top-2 right-1/4 h-4 min-w-4 px-1 text-[9px] bg-destructive text-destructive-foreground border-0">
                    {it.badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
