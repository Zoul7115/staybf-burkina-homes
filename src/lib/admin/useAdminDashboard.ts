import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminDashboardData, AdminBookingRow, AdminHostRow, ChartPoint } from "./types";

// Last N months as YYYY-MM labels
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(ym: string): string {
  const [y, mo] = ym.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
}

type RawBookingRow = {
  id: string;
  reference: string;
  status: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_amount: number;
  currency: string;
  payment_status: string | null;
  created_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  rooms: {
    name: string;
    properties: { name: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { name: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[] | null;
  } | { name: string; properties: unknown } [] | null;
};

type RawHostRow = {
  id: string;
  status: string;
  superhost: boolean;
  verified_at: string | null;
  host_since: string | null;
  company_name: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null; country: string | null; account_status: string } | { full_name: string | null; email: string | null; avatar_url: string | null; country: string | null; account_status: string }[] | null;
};

type RawDailyMetric = {
  date: string;
  metric_key: string;
  metric_value: number;
};

type RawPayment = {
  amount_fcfa: number;
  captured_at: string | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminDashboardReturn = {
  data: AdminDashboardData | null;
  loading: boolean;
  error: string | null;
};

export function useAdminDashboard(): UseAdminDashboardReturn {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const db = supabase as unknown as ReturnType<typeof supabase.from> extends never ? never : typeof supabase;

        const months = lastMonths(7);
        const since = `${months[0]}-01`;

        const [
          hostsRes,
          propertiesRes,
          bookingsRes,
          subsRes,
          pendingHostsRes,
          moderationRes,
          paymentsRes,
          metricsRes,
          recentBookingsRes,
          pendingHostListRes,
        ] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("host_profiles").select("id", { count: "exact", head: true }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("properties").select("id", { count: "exact", head: true }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("bookings").select("id", { count: "exact", head: true }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("billing.subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("host_profiles").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("moderation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("payments").select("amount_fcfa, captured_at").eq("status", "captured").gte("captured_at", `${since}T00:00:00`),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("daily_metrics").select("date, metric_key, metric_value").eq("dimension_type", "global").gte("date", since).in("metric_key", ["gross_revenue_fcfa", "bookings_created", "new_hosts"]),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("bookings").select(`
            id, reference, status, check_in, check_out, nights, total_amount, currency, payment_status, created_at,
            profiles!traveler_id(full_name),
            rooms!room_id(name, properties!property_id(name, profiles!host_id(full_name)))
          `).order("created_at", { ascending: false }).limit(5),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from("host_profiles").select(`
            id, status, superhost, verified_at, host_since, company_name, created_at,
            profiles!id(full_name, email, avatar_url, country, account_status)
          `).eq("status", "pending_review").order("created_at", { ascending: false }).limit(5),
        ]);

        if (cancelled) return;

        // KPIs
        const totalRevenueFcfa = ((paymentsRes.data ?? []) as RawPayment[]).reduce((s, p) => s + (p.amount_fcfa ?? 0), 0);

        // Chart data from daily_metrics (may be empty if not populated)
        const rawMetrics = ((metricsRes.data ?? []) as RawDailyMetric[]);
        const revenueChart: ChartPoint[] = months.map((ym) => {
          const sum = rawMetrics
            .filter((m) => m.date.startsWith(ym) && m.metric_key === "gross_revenue_fcfa")
            .reduce((s, m) => s + (m.metric_value ?? 0), 0);
          return { label: monthLabel(ym), value: Math.round(sum / 1000) }; // in thousands
        });
        const bookingsChart: ChartPoint[] = months.map((ym) => {
          const sum = rawMetrics
            .filter((m) => m.date.startsWith(ym) && m.metric_key === "bookings_created")
            .reduce((s, m) => s + (m.metric_value ?? 0), 0);
          return { label: monthLabel(ym), value: Math.round(sum) };
        });
        const growthChart: ChartPoint[] = months.map((ym) => {
          const sum = rawMetrics
            .filter((m) => m.date.startsWith(ym) && m.metric_key === "new_hosts")
            .reduce((s, m) => s + (m.metric_value ?? 0), 0);
          return { label: monthLabel(ym), value: Math.round(sum) };
        });

        // Fallback charts from payments if daily_metrics empty
        const useFallbackRevenue = revenueChart.every((p) => p.value === 0);
        if (useFallbackRevenue) {
          const pmts = ((paymentsRes.data ?? []) as RawPayment[]);
          months.forEach((ym, i) => {
            const sum = pmts
              .filter((p) => p.captured_at?.startsWith(ym))
              .reduce((s, p) => s + (p.amount_fcfa ?? 0), 0);
            revenueChart[i] = { label: revenueChart[i].label, value: Math.round(sum / 1000) };
          });
        }

        // Recent bookings
        const rawBookings = ((recentBookingsRes.data ?? []) as RawBookingRow[]);
        const recentBookings: AdminBookingRow[] = rawBookings.map((b) => {
          const traveler = unwrap(b.profiles);
          const room = unwrap(b.rooms as RawBookingRow["rooms"]);
          const prop = room ? unwrap((room as { name: string; properties: unknown }).properties as RawBookingRow["rooms"]) : null;
          const host = prop ? unwrap((prop as { name: string; profiles: unknown }).profiles as RawBookingRow["profiles"]) : null;
          return {
            id: b.id,
            reference: b.reference,
            status: b.status,
            checkIn: b.check_in,
            checkOut: b.check_out,
            nights: b.nights,
            totalAmount: b.total_amount,
            currency: b.currency,
            paymentStatus: b.payment_status,
            travelerName: traveler?.full_name ?? null,
            hostName: host?.full_name ?? null,
            propertyName: prop ? (prop as { name: string }).name : null,
            roomName: room ? (room as { name: string }).name : null,
            createdAt: b.created_at,
          };
        });

        // Pending hosts
        const rawPendingHosts = ((pendingHostListRes.data ?? []) as RawHostRow[]);
        const pendingHosts: AdminHostRow[] = rawPendingHosts.map((h) => {
          const p = unwrap(h.profiles);
          return {
            id: h.id,
            name: p?.full_name ?? null,
            email: p?.email ?? null,
            avatarUrl: p?.avatar_url ?? null,
            city: p?.country ?? null,
            companyName: h.company_name ?? null,
            status: h.status,
            verifiedAt: h.verified_at ?? null,
            superhost: h.superhost,
            propertiesCount: 0,
            accountStatus: p?.account_status ?? "active",
            hostSince: h.host_since ?? null,
            createdAt: h.created_at,
          };
        });

        setData({
          stats: {
            totalRevenueFcfa,
            totalHosts: hostsRes.count ?? 0,
            totalTravelers: Math.max(0, (propertiesRes.count ?? 0)), // approximate
            totalProperties: propertiesRes.count ?? 0,
            totalBookings: bookingsRes.count ?? 0,
            activeSubscriptions: subsRes.count ?? 0,
            pendingVerifications: pendingHostsRes.count ?? 0,
            systemAlerts: moderationRes.count ?? 0,
          },
          revenueChart,
          bookingsChart,
          growthChart,
          recentBookings,
          pendingHosts,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
