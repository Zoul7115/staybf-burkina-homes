import { type ReactNode, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";

export function StatCard({
  label, value, delta, deltaTrend = "up", icon: Icon, accent = "primary", hint,
}: {
  label: string; value: string | number;
  delta?: string; deltaTrend?: "up" | "down";
  icon?: ComponentType<{ className?: string }>;
  accent?: "primary" | "secondary" | "destructive" | "muted";
  hint?: string;
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/20 text-secondary-foreground",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="p-5 hover:shadow-elevated transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="font-display text-2xl font-bold mt-1">{value}</p>
          {delta && (
            <div className={cn("inline-flex items-center gap-1 mt-2 text-xs font-semibold rounded-full px-2 py-0.5",
              deltaTrend === "up" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
              {deltaTrend === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {delta}
            </div>
          )}
          {hint && <p className="text-[11px] text-muted-foreground mt-2">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", accentMap[accent])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}

export function MiniBarChart({
  data, label, height = 160, accent = "primary",
}: {
  data: { label: string; value: number }[];
  label?: string;
  height?: number;
  accent?: "primary" | "secondary";
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <Card className="p-5">
      {label && <p className="text-sm font-semibold mb-4">{label}</p>}
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="w-full flex items-end justify-center" style={{ height: height - 24 }}>
              <div
                className={cn("w-full rounded-md transition-all hover:opacity-80",
                  accent === "primary" ? "gradient-primary" : "bg-secondary")}
                style={{ height: `${(d.value / max) * 100}%`, minHeight: 4 }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function MiniLineChart({
  data, label, height = 160,
}: {
  data: { label: string; value: number }[];
  label?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - ((d.value - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <Card className="p-5">
      {label && <p className="text-sm font-semibold mb-4">{label}</p>}
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#lineGrad)" />
          <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
        {data.map((d, i) => <span key={i}>{d.label}</span>)}
      </div>
    </Card>
  );
}

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <Card className="p-12 text-center">
      <div className="mx-auto h-16 w-16 rounded-full bg-muted grid place-items-center mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-primary/10 text-primary border-primary/20",
    upcoming: "bg-primary/10 text-primary border-primary/20",
    pending: "bg-secondary/20 text-secondary-foreground border-secondary/30",
    completed: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    approved: "bg-primary/10 text-primary border-primary/20",
    active: "bg-primary/10 text-primary border-primary/20",
    suspended: "bg-destructive/10 text-destructive border-destructive/20",
    paid: "bg-primary/10 text-primary border-primary/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
    refunded: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  };
  const labels: Record<string, string> = {
    confirmed: "Confirmé", upcoming: "À venir", pending: "En attente", completed: "Terminé",
    cancelled: "Annulé", rejected: "Refusé", approved: "Approuvé", active: "Actif",
    suspended: "Suspendu", paid: "Payé", failed: "Échec", refunded: "Remboursé",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
      map[status] || "bg-muted text-muted-foreground border-border")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status] || status}
    </span>
  );
}

export function SectionCard({
  title, action, children, className,
}: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-base">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}
