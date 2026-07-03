import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  CalendarDay,
  RoomAvailabilityData,
  AvailabilityStatus,
} from "./types";

type RawAvailRow = {
  id: string;
  room_id: string;
  date: string;
  status: string;
  booking_id: string | null;
  price_override_fcfa: number | null;
  bookings: {
    reference: string;
    check_in: string;
    check_out: string;
  } | null;
};

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

export function useHostCalendar(
  roomId: string | null,
  year: number,
  month: number
): UseHostCalendarReturn {
  const [data, setData] = useState<RoomAvailabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // Fetch room_availability for the given room and month.
      // Include a small buffer (last days of prev month + first days of next)
      // so the grid has data even when the calendar grid shows padding days.
      const startDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: dbErr } = await (supabase as any)
        .from("room_availability")
        .select(
          `
          id,
          room_id,
          date,
          status,
          booking_id,
          price_override_fcfa,
          bookings!booking_id(reference, check_in, check_out)
          `
        )
        .eq("room_id", roomId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (cancelled) return;

      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      const rawRows = (rows ?? []) as RawAvailRow[];

      const daysMap: Record<string, CalendarDay> = {};
      let bookedCount = 0;
      let blockedCount = 0;
      let openCount = 0;

      for (const r of rawRows) {
        const status = r.status as AvailabilityStatus;

        const booking = Array.isArray(r.bookings)
          ? (r.bookings[0] ?? null)
          : r.bookings;

        daysMap[r.date] = {
          date: r.date,
          status,
          bookingId: r.booking_id,
          bookingReference: booking?.reference ?? null,
          bookingCheckIn: booking?.check_in ?? null,
          bookingCheckOut: booking?.check_out ?? null,
          priceOverride: r.price_override_fcfa,
        };

        if (status === "booked") bookedCount++;
        else if (status === "blocked") blockedCount++;
        else openCount++;
      }

      setData({ days: daysMap, bookedCount, blockedCount, openCount });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [roomId, year, month]);

  function datesInRange(startDate: string, endDate: string): string[] {
    const out: string[] = [];
    const cursor = new Date(startDate);
    const end = new Date(endDate);
    while (cursor <= end) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  const blockDates = useCallback(async (startDate: string, endDate: string) => {
    if (!roomId) return;
    setMutating(true);
    setMutationError(null);

    const dates = datesInRange(startDate, endDate);

    setData((prev) => {
      if (!prev) return prev;
      const days = { ...prev.days };
      let blocked = prev.blockedCount;
      let open = prev.openCount;
      for (const d of dates) {
        const existing = days[d];
        if (existing?.status === "booked") continue;
        if (!existing || existing.status === "open") open = Math.max(0, open - 1);
        if (existing?.status !== "blocked") blocked++;
        days[d] = existing
          ? { ...existing, status: "blocked" }
          : { date: d, status: "blocked", bookingId: null, bookingReference: null, bookingCheckIn: null, bookingCheckOut: null, priceOverride: null };
      }
      return { ...prev, days, blockedCount: blocked, openCount: open };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("room_availability")
      .upsert(
        dates.map((d) => ({ room_id: roomId, date: d, status: "blocked" })),
        { onConflict: "room_id,date" }
      );

    if (dbErr) setMutationError(dbErr.message);
    setMutating(false);
  }, [roomId]);

  const unblockDates = useCallback(async (startDate: string, endDate: string) => {
    if (!roomId) return;
    setMutating(true);
    setMutationError(null);

    const dates = datesInRange(startDate, endDate);

    setData((prev) => {
      if (!prev) return prev;
      const days = { ...prev.days };
      let blocked = prev.blockedCount;
      let open = prev.openCount;
      for (const d of dates) {
        const existing = days[d];
        if (!existing || existing.status !== "blocked") continue;
        blocked = Math.max(0, blocked - 1);
        open++;
        days[d] = { ...existing, status: "open" };
      }
      return { ...prev, days, blockedCount: blocked, openCount: open };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("room_availability")
      .update({ status: "open" })
      .eq("room_id", roomId)
      .eq("status", "blocked")
      .gte("date", startDate)
      .lte("date", endDate);

    if (dbErr) setMutationError(dbErr.message);
    setMutating(false);
  }, [roomId]);

  const setPriceOverride = useCallback(async (startDate: string, endDate: string, price: number | null) => {
    if (!roomId) return;
    setMutating(true);
    setMutationError(null);

    const dates = datesInRange(startDate, endDate);

    setData((prev) => {
      if (!prev) return prev;
      const days = { ...prev.days };
      for (const d of dates) {
        const existing = days[d];
        if (existing) {
          days[d] = { ...existing, priceOverride: price };
        }
      }
      return { ...prev, days };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("room_availability")
      .update({ price_override_fcfa: price })
      .eq("room_id", roomId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (dbErr) setMutationError(dbErr.message);
    setMutating(false);
  }, [roomId]);

  const setSeasonalPricing = useCallback(async (startDate: string, endDate: string, price: number) => {
    if (!roomId) return;
    setMutating(true);
    setMutationError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("seasonal_pricing")
      .upsert(
        { room_id: roomId, start_date: startDate, end_date: endDate, price_fcfa: price, is_active: true },
        { onConflict: "room_id,start_date,end_date" }
      );

    if (dbErr) setMutationError(dbErr.message);
    setMutating(false);
  }, [roomId]);

  return {
    data, loading, error,
    blockDates, unblockDates, setPriceOverride, setSeasonalPricing,
    mutating, mutationError,
  };
}
