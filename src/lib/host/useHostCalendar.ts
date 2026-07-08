import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { CalendarDay, RoomAvailabilityData, AvailabilityStatus } from "./types";

type RawAvailRow = {
  id: string; room_id: string; date: string; status: string; booking_id: string | null;
  price_override_fcfa: number | null;
  bookings: { reference: string; check_in: string; check_out: string } | null;
};

// ── Helpers ───────────────────────────────────────────────────

function datesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) { out.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1); }
  return out;
}

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostCalendar(roomId: string, year: number, month: number): Promise<RoomAvailabilityData> {
  const startDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (supabase as any)
    .from("room_availability")
    .select(`id,room_id,date,status,booking_id,price_override_fcfa,bookings!booking_id(reference,check_in,check_out)`)
    .eq("room_id", roomId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (dbErr) throw new Error(dbErr.message);

  const rawRows = (rows ?? []) as RawAvailRow[];
  const daysMap: Record<string, CalendarDay> = {};
  let bookedCount = 0, blockedCount = 0, openCount = 0;

  for (const r of rawRows) {
    const status = r.status as AvailabilityStatus;
    const booking = Array.isArray(r.bookings) ? (r.bookings[0] ?? null) : r.bookings;
    daysMap[r.date] = {
      date: r.date, status, bookingId: r.booking_id,
      bookingReference: booking?.reference ?? null, bookingCheckIn: booking?.check_in ?? null,
      bookingCheckOut: booking?.check_out ?? null, priceOverride: r.price_override_fcfa,
    };
    if (status === "booked") bookedCount++;
    else if (status === "blocked") blockedCount++;
    else openCount++;
  }

  return { days: daysMap, bookedCount, blockedCount, openCount };
}

// ── Hook ─────────────────────────────────────────────────────

type UseHostCalendarReturn = {
  data: RoomAvailabilityData | null;
  loading: boolean;
  error: string | null;
  blockDates: (startDate: string, endDate: string) => Promise<void>;
  unblockDates: (startDate: string, endDate: string) => Promise<void>;
  setPriceOverride: (startDate: string, endDate: string, price: number | null) => Promise<void>;
  setSeasonalPricing: (startDate: string, endDate: string, price: number) => Promise<void>;
  mutating: boolean;
  mutationError: string | null;
};

export function useHostCalendar(roomId: string | null, year: number, month: number): UseHostCalendarReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.hostCalendar(roomId ?? "", year, month);

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => fetchHostCalendar(roomId!, year, month),
    enabled: !!roomId,
    staleTime: 30_000,
  });

  const blockMutation = useMutation({
    mutationFn: async ({ start, end }: { start: string; end: string }) => {
      if (!roomId) return;
      const dates = datesInRange(start, end);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("room_availability")
        .upsert(dates.map((d) => ({ room_id: roomId, date: d, status: "blocked" })), { onConflict: "room_id,date" });
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ start, end }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<RoomAvailabilityData>(KEY);
      queryClient.setQueryData<RoomAvailabilityData>(KEY, (old) => {
        if (!old) return old;
        const days = { ...old.days };
        let blocked = old.blockedCount, open = old.openCount;
        for (const d of datesInRange(start, end)) {
          const ex = days[d];
          if (ex?.status === "booked") continue;
          if (!ex || ex.status === "open") open = Math.max(0, open - 1);
          if (ex?.status !== "blocked") blocked++;
          days[d] = ex ? { ...ex, status: "blocked" } : { date: d, status: "blocked", bookingId: null, bookingReference: null, bookingCheckIn: null, bookingCheckOut: null, priceOverride: null };
        }
        return { ...old, days, blockedCount: blocked, openCount: open };
      });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const unblockMutation = useMutation({
    mutationFn: async ({ start, end }: { start: string; end: string }) => {
      if (!roomId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("room_availability").update({ status: "open" })
        .eq("room_id", roomId).eq("status", "blocked").gte("date", start).lte("date", end);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ start, end }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<RoomAvailabilityData>(KEY);
      queryClient.setQueryData<RoomAvailabilityData>(KEY, (old) => {
        if (!old) return old;
        const days = { ...old.days };
        let blocked = old.blockedCount, open = old.openCount;
        for (const d of datesInRange(start, end)) {
          const ex = days[d];
          if (!ex || ex.status !== "blocked") continue;
          blocked = Math.max(0, blocked - 1); open++;
          days[d] = { ...ex, status: "open" };
        }
        return { ...old, days, blockedCount: blocked, openCount: open };
      });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const priceMutation = useMutation({
    mutationFn: async ({ start, end, price }: { start: string; end: string; price: number | null }) => {
      if (!roomId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("room_availability").update({ price_override_fcfa: price })
        .eq("room_id", roomId).gte("date", start).lte("date", end);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ start, end, price }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<RoomAvailabilityData>(KEY);
      queryClient.setQueryData<RoomAvailabilityData>(KEY, (old) => {
        if (!old) return old;
        const days = { ...old.days };
        for (const d of datesInRange(start, end)) { if (days[d]) days[d] = { ...days[d], priceOverride: price }; }
        return { ...old, days };
      });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const seasonalMutation = useMutation({
    mutationFn: async ({ start, end, price }: { start: string; end: string; price: number }) => {
      if (!roomId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("seasonal_pricing")
        .upsert({ room_id: roomId, starts_on: start, ends_on: end, price_fcfa: price }, { onConflict: "room_id,starts_on,ends_on" });
      if (dbErr) throw new Error(dbErr.message);
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const mutating = blockMutation.isPending || unblockMutation.isPending || priceMutation.isPending || seasonalMutation.isPending;
  const mutationError = (blockMutation.error ?? unblockMutation.error ?? priceMutation.error ?? seasonalMutation.error)?.message ?? null;

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    blockDates: (start, end) => blockMutation.mutateAsync({ start, end }),
    unblockDates: (start, end) => unblockMutation.mutateAsync({ start, end }),
    setPriceOverride: (start, end, price) => priceMutation.mutateAsync({ start, end, price }),
    setSeasonalPricing: (start, end, price) => seasonalMutation.mutateAsync({ start, end, price }),
    mutating,
    mutationError,
  };
}
