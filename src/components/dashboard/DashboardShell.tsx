import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode, type ComponentType } from "react";
import { Bell, Menu, X, Search, Leaf, LogOut, ChevronRight, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
};

export type DashboardUser = {
  name: string;
  email: string;
  avatar: string; // initials
  role: string;
};

export type ShellNotification = {
  id: string;
  title: string;
  text: string;
  time: string;
  unread?: boolean;
};

type Props = {
  navItems: NavItem[];
  user: DashboardUser;
  notifications: ShellNotification[];
  title: string;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
  children: ReactNode;
  brandAccent?: "primary" | "secondary";
};

export function DashboardShell({
  navItems, user, notifications, title, breadcrumbs, actions, children,
  brandAccent = "primary",
}: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [notifOpen, setNotifOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const unread = notifications.filter((n) => n.unread).length;

  const toggleDark = () => {
    setDark((v) => {
      const next = !v;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  };

  const mobileNav = navItems.slice(0, 5);

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-background sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2 px-6 h-16 border-b border-border">
          <span className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground",
            brandAccent === "primary" ? "gradient-primary" : "bg-foreground",
          )}>
            <Leaf className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <div className="font-display font-bold text-lg leading-tight">
              Stay<span className="text-secondary">BF</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {user.role}
            </div>
          </div>
        </Link>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((it) => {
            const Icon = it.icon;
            const active = path === it.to || (it.to !== "/" && path.startsWith(it.to + "/"));
            return (
              <Link
                key={it.to} to={it.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-card" :
                    "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{it.label}</span>
                {it.badge ? (
                  <span className={cn(
                    "text-[10px] font-bold rounded-full h-5 min-w-5 px-1.5 grid place-items-center",
                    active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                  )}>
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-xs shrink-0">
              {user.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Déconnexion">
              <Link to="/"><LogOut className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border h-16 flex items-center gap-3 px-4 lg:px-6">
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
                <div>
                  <div className="font-display font-bold text-lg">Stay<span className="text-secondary">BF</span></div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{user.role}</div>
                </div>
              </div>
              <nav className="p-3 space-y-0.5">
                {navItems.map((it) => {
                  const Icon = it.icon;
                  const active = path === it.to || (it.to !== "/" && path.startsWith(it.to + "/"));
                  return (
                    <Link key={it.to} to={it.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                      )}>
                      <Icon className="h-4 w-4" /> <span className="flex-1">{it.label}</span>
                      {it.badge ? <Badge variant="secondary" className="text-[10px]">{it.badge}</Badge> : null}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="hidden md:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background" />
            </div>
          </div>

          <div className="flex-1 md:hidden">
            <h1 className="font-display font-semibold text-base truncate">{title}</h1>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Thème">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
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
                        <li key={n.id} className={cn("px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50",
                          n.unread && "bg-primary/5")}>
                          <div className="flex items-start gap-2">
                            <span className={cn("h-2 w-2 rounded-full mt-1.5",
                              n.unread ? "bg-primary" : "bg-transparent")} />
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
            <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-xs">
              {user.avatar}
            </div>
          </div>
        </header>

        {/* Page header */}
        <div className="px-4 lg:px-6 pt-5 pb-3 border-b border-border bg-background">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="hidden md:flex items-center gap-1 text-xs text-muted-foreground mb-2">
              {breadcrumbs.map((bc, i) => (
                <span key={i} className="flex items-center gap-1">
                  {bc.to ? <Link to={bc.to} className="hover:text-foreground">{bc.label}</Link> : <span>{bc.label}</span>}
                  {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
                </span>
              ))}
            </nav>
          )}
          <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
            <h1 className="font-display font-bold text-xl md:text-2xl truncate">{title}</h1>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
          </div>
        </div>

        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-8 animate-fade-in">
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
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
