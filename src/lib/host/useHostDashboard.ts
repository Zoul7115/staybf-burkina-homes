import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type {
  HostDashboardData,
  DashboardStats,
  DashboardCheckIn,
  DashboardReview,
  DashboardMessage,
  BookingStatus,
} from "./types";

// ── Raw row types (PostgREST responses) ──────────────────────

type RawBookingRow = {
  id: string;
  reference: string;
  check_in: string;
  check_out: string;
  guests_adults: number;
  status: string;
  total_amount: number;
  host_payout_amount: number | null;
  confirmed_at: string | null;
  created_at: string;
  rooms: { name: string } | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

type RawReviewRow = {
  id: string;
  overall_rating: number;
  body: string;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

type RawThreadRow = {
  id: string;
  last_message_at: string | null;
  host_unread_count: number;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  messages: { body: string | null }[];
};

// ── Helpers ───────────────────────────────────────────────────

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostDashboard(): Promise<HostDashboardData> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  const hostId = user.id;

  // Resolve host property IDs first to filter bookings correctly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propsData } = await (supabase as any)
    .from("properties")
    .select("id")
    .eq("host_id", hostId);
  const propertyIds: string[] = (propsData ?? []).map((p: { id: string }) => p.id);

  const [bookingsRes, confirmedThisMonthRes, reviewsRes, threadsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    propertyIds.length === 0 ? Promise.resolve({ data: [], error: null }) : (supabase as any)
      .from("bookings")
      .select(`id,reference,check_in,check_out,guests_adults,status,total_amount,confirmed_at,created_at,rooms!room_id(name),profiles!traveler_id(full_name,avatar_url)`)
      .in("property_id", propertyIds)
      .in("status", ["awaiting_host", "confirmed", "checked_in", "pending_payment", "completed"])
      .gte("check_in", today())
      .lte("check_in", sevenDaysFromNow())
      .order("check_in", { ascending: true })
      .limit(20),

    // Separate count for "confirmed this month" — not limited to 7-day check-in window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    propertyIds.length === 0 ? Promise.resolve({ count: 0, error: null }) : (supabase as any)
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("property_id", propertyIds)
      .in("status", ["confirmed", "checked_in", "completed"])
      .gte("confirmed_at", startOfMonth()),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("reviews")
      .select(`id,overall_rating,body,created_at,profiles!reviewer_id(full_name,avatar_url)`)
      .eq("direction", "traveler_to_host")
      .eq("is_published", true)
      .eq("status", "published")
      .eq("reviewee_id", hostId)
      .order("created_at", { ascending: false })
      .limit(5),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("threads")
      .select(`id,last_message_at,host_unread_count,profiles!traveler_id(full_name,avatar_url),messages(body)`)
      .eq("host_id", hostId)
      .eq("is_archived_host", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(3),
  ]);

  const errors = [bookingsRes.error, confirmedThisMonthRes.error, reviewsRes.error, threadsRes.error].filter(Boolean);
  if (errors.length > 0) throw new Error(errors.map((e: { message: string }) => e.message).join("; "));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payoutsRes = await (supabase as any)
    .from("payouts")
    .select("amount_fcfa,status")
    .eq("host_id", hostId)
    .eq("status", "paid")
    .gte("period_start", startOfMonth());

  if (payoutsRes.error) throw new Error(payoutsRes.error.message);

  const allBookings = (bookingsRes.data ?? []) as RawBookingRow[];
  const allReviews = (reviewsRes.data ?? []) as RawReviewRow[];
  const allThreads = (threadsRes.data ?? []) as RawThreadRow[];
  const allPayouts = (payoutsRes.data ?? []) as { amount_fcfa: number }[];

  const monthlyRevenueFcfa = allPayouts.reduce((sum, p) => sum + (p.amount_fcfa ?? 0), 0);
  const confirmedThisMonth = confirmedThisMonthRes.count ?? 0;
  const pendingBookings = allBookings.filter(
    (b) => b.status === "awaiting_host" || b.status === "pending_payment"
  ).length;
  const avgRating = allReviews.length > 0
    ? allReviews.reduce((s, r) => s + r.overall_rating, 0) / allReviews.length
    : null;

  const stats: DashboardStats = {
    monthlyRevenueFcfa,
    totalBookingsThisMonth: confirmedThisMonth,
    pendingBookings,
    avgRating: avgRating ? Math.round(avgRating * 100) / 100 : null,
    totalReviews: allReviews.length,
  };

  const checkIns: DashboardCheckIn[] = allBookings
    .filter((b) => b.status === "confirmed" || b.status === "checked_in")
    .map((b) => ({
      bookingId: b.id, reference: b.reference,
      travelerName: b.profiles?.full_name ?? null, roomName: b.rooms?.name ?? null,
      checkIn: b.check_in, guestsAdults: b.guests_adults, status: b.status as BookingStatus,
    }));

  const checkOuts: DashboardCheckIn[] = allBookings
    .filter((b) => b.status === "checked_in")
    .map((b) => ({
      bookingId: b.id, reference: b.reference,
      travelerName: b.profiles?.full_name ?? null, roomName: b.rooms?.name ?? null,
      checkIn: b.check_out, guestsAdults: b.guests_adults, status: b.status as BookingStatus,
    }));

  const recentReviews: DashboardReview[] = allReviews.map((r) => ({
    id: r.id, reviewerName: r.profiles?.full_name ?? null,
    reviewerAvatarUrl: r.profiles?.avatar_url ?? null,
    overallRating: r.overall_rating, body: r.body, createdAt: r.created_at,
  }));

  const recentMessages: DashboardMessage[] = allThreads.map((t) => {
    const msgs = t.messages ?? [];
    const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    return {
      threadId: t.id, travelerName: t.profiles?.full_name ?? null,
      travelerAvatarUrl: t.profiles?.avatar_url ?? null,
      lastMessageBody: last?.body ?? null, lastMessageAt: t.last_message_at,
      hostUnreadCount: t.host_unread_count,
    };
  });

  return { stats, upcomingCheckIns: checkIns, upcomingCheckOuts: checkOuts, recentReviews, recentMessages };
}

// ── Hook ─────────────────────────────────────────────────────

export function useHostDashboard(): { data: HostDashboardData | null; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostDashboard(),
    queryFn: fetchHostDashboard,
    staleTime: 30_000,
  });

  return { data: data ?? null, loading: isLoading, error: error?.message ?? null };
}
