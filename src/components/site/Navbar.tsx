import { useEffect, useState } from "react";
import { Menu, Search, Leaf, LayoutDashboard, Home, ShieldCheck, ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function Navbar({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(solid);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-md border-b border-border shadow-card"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 md:h-18 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-card group-hover:scale-105 transition-transform">
            <Leaf className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className={`font-display font-bold text-xl tracking-tight ${scrolled ? "text-foreground" : "text-white"}`}>
            Stay<span className="text-secondary">BF</span>
          </span>
        </Link>

        <button
          className={`hidden md:flex items-center gap-2 rounded-full border pl-5 pr-1.5 py-1.5 shadow-card hover:shadow-elevated transition ${
            scrolled ? "bg-background border-border" : "bg-white/95 border-white/40"
          }`}
        >
          <span className="text-sm font-medium text-foreground">Où voulez-vous séjourner ?</span>
          <span className="h-6 w-px bg-border" />
          <span className="text-sm text-muted-foreground">Quand ?</span>
          <span className="h-8 w-8 rounded-full gradient-primary text-primary-foreground inline-flex items-center justify-center ml-1">
            <Search className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}>
                Espaces <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Accéder à un espace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/traveler/dashboard"><Home className="h-4 w-4 mr-2" /> Espace voyageur</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/host/dashboard"><LayoutDashboard className="h-4 w-4 mr-2" /> Espace hôte</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/admin/dashboard"><ShieldCheck className="h-4 w-4 mr-2" /> Espace admin</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild variant="ghost" className={scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}>
            <Link to="/auth/login">Connexion</Link>
          </Button>
          <Button asChild className="bg-primary hover:bg-primary-dark text-primary-foreground shadow-card">
            <Link to="/auth/register">S'inscrire</Link>
          </Button>
        </nav>

        {/* Mobile */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85%] max-w-sm">
              <div className="flex flex-col gap-2 pt-8">
                <Link to="/" className="flex items-center gap-2 pb-6">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
                    <Leaf className="h-5 w-5" />
                  </span>
                  <span className="font-display font-bold text-xl">
                    Stay<span className="text-primary">BF</span>
                  </span>
                </Link>
                <Button asChild variant="ghost" className="justify-start text-base"><Link to="/search">Rechercher</Link></Button>
                <Button asChild variant="ghost" className="justify-start text-base"><Link to="/traveler/dashboard">Espace voyageur</Link></Button>
                <Button asChild variant="ghost" className="justify-start text-base"><Link to="/host/dashboard">Espace hôte</Link></Button>
                <Button asChild variant="ghost" className="justify-start text-base"><Link to="/admin/dashboard">Espace admin</Link></Button>
                <Button asChild variant="outline" className="mt-2"><Link to="/auth/login">Connexion</Link></Button>
                <Button asChild className="bg-primary hover:bg-primary-dark text-primary-foreground"><Link to="/auth/register">S'inscrire</Link></Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
