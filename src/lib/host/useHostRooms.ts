import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HostRoomDetail, RoomStatus, RoomType, BedEntry, RoomImage } from "./types";

const ROOM_IMAGES_BUCKET = "room-images";

export function roomImageUrl(storagePath: string): string {
  const { data } = supabase.storage.from(ROOM_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

type RawRoomRow = {
  id: string;
  property_id: string;
  name: string;
  type: string;
  max_guests: number;
  beds: BedEntry[];
  base_price_fcfa: number;
  status: string;
  instant_book: boolean;
  created_at: string;
  updated_at: string;
  room_images: { id: string; storage_path: string; alt: string | null; position: number; is_cover: boolean }[];
};

export type RoomFormParams = {
  propertyId: string;
  name: string;
  type: string;
  max_guests: number;
  base_price_fcfa: number;
};

type UseHostRoomsReturn = {
  rooms: HostRoomDetail[];
  propertyId: string | null;
  loading: boolean;
  error: string | null;
  createRoom: (params: RoomFormParams) => Promise<void>;
  updateRoom: (id: string, params: Omit<RoomFormParams, "propertyId">) => Promise<void>;
  saving: boolean;
  saveError: string | null;
};

export function useHostRooms(): UseHostRoomsReturn {
  const [rooms, setRooms] = useState<HostRoomDetail[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Non authentifié");
          setLoading(false);
        }
        return;
      }

      // Fetch host's property IDs first (RLS on rooms requires is_host_of)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propData, error: propErr } = await (supabase as any)
        .from("properties")
        .select("id")
        .eq("host_id", user.id)
        .is("deleted_at", null);

      if (cancelled) return;
      if (propErr) {
        setError(propErr.message);
        setLoading(false);
        return;
      }

      const propertyIds: string[] = ((propData ?? []) as { id: string }[]).map((p) => p.id);
      if (!cancelled && propertyIds[0]) setPropertyId(propertyIds[0]);

      if (propertyIds.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      // Fetch rooms with images in one query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roomData, error: roomErr } = await (supabase as any)
        .from("rooms")
        .select(
          `
          id,
          property_id,
          name,
          type,
          max_guests,
          beds,
          base_price_fcfa,
          status,
          instant_book,
          created_at,
          updated_at,
          room_images(id, storage_path, alt, position, is_cover)
          `
        )
        .in("property_id", propertyIds)
        .neq("status", "archived")
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (roomErr) {
        setError(roomErr.message);
        setLoading(false);
        return;
      }

      const rawRooms = (roomData ?? []) as RawRoomRow[];
      const roomIds = rawRooms.map((r) => r.id);

      if (roomIds.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const in30Days = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      })();

      // Booking counts and open availability in parallel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [bookingsRes, availRes] = await Promise.all([
        (supabase as any)
          .from("bookings")
          .select("room_id")
          .in("room_id", roomIds)
          .in("status", ["confirmed", "checked_in", "completed"]),
        (supabase as any)
          .from("room_availability")
          .select("room_id")
          .in("room_id", roomIds)
          .eq("status", "open")
          .gte("date", today)
          .lte("date", in30Days),
      ]);

      if (cancelled) return;

      const bookingRows = (bookingsRes.data ?? []) as { room_id: string }[];
      const availRows = (availRes.data ?? []) as { room_id: string }[];

      const bookingCountByRoom = bookingRows.reduce<Record<string, number>>((acc, b) => {
        acc[b.room_id] = (acc[b.room_id] ?? 0) + 1;
        return acc;
      }, {});

      const openNightsByRoom = availRows.reduce<Record<string, number>>((acc, a) => {
        acc[a.room_id] = (acc[a.room_id] ?? 0) + 1;
        return acc;
      }, {});

      const mapped: HostRoomDetail[] = rawRooms.map((r) => {
        const sortedImages: RoomImage[] = [...(r.room_images ?? [])].sort(
          (a, b) => a.position - b.position
        );
        return {
          id: r.id,
          property_id: r.property_id,
          name: r.name,
          type: r.type as RoomType,
          max_guests: r.max_guests,
          beds: (r.beds ?? []) as BedEntry[],
          base_price_fcfa: r.base_price_fcfa,
          status: r.status as RoomStatus,
          instant_book: r.instant_book,
          created_at: r.created_at,
          updated_at: r.updated_at,
          images: sortedImages,
          booking_count: bookingCountByRoom[r.id] ?? 0,
          open_nights_next_30: openNightsByRoom[r.id] ?? 0,
        };
      });

      setRooms(mapped);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const createRoom = useCallback(async (params: RoomFormParams) => {
    setSaving(true);
    setSaveError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: dbErr } = await (supabase as any)
      .from("rooms")
      .insert({
        property_id: params.propertyId,
        name: params.name,
        type: params.type,
        max_guests: params.max_guests,
        base_price_fcfa: params.base_price_fcfa,
        status: "active",
        instant_book: false,
        beds: [],
      })
      .select("id, property_id, name, type, max_guests, beds, base_price_fcfa, status, instant_book, created_at, updated_at")
      .single();

    if (dbErr) {
      setSaveError(dbErr.message);
      setSaving(false);
      throw new Error(dbErr.message);
    }

    const newRoom: HostRoomDetail = {
      id: row.id,
      property_id: row.property_id,
      name: row.name,
      type: row.type as RoomType,
      max_guests: row.max_guests,
      beds: (row.beds ?? []) as BedEntry[],
      base_price_fcfa: row.base_price_fcfa,
      status: row.status as RoomStatus,
      instant_book: row.instant_book,
      created_at: row.created_at,
      updated_at: row.updated_at,
      images: [],
      booking_count: 0,
      open_nights_next_30: 0,
    };

    setRooms((prev) => [...prev, newRoom]);
    setSaving(false);
  }, []);

  const updateRoom = useCallback(async (id: string, params: Omit<RoomFormParams, "propertyId">) => {
    setSaving(true);
    setSaveError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("rooms")
      .update({ name: params.name, type: params.type, max_guests: params.max_guests, base_price_fcfa: params.base_price_fcfa })
      .eq("id", id);

    if (dbErr) {
      setSaveError(dbErr.message);
      setSaving(false);
      throw new Error(dbErr.message);
    }

    setRooms((prev) =>
      prev.map((r) => r.id === id ? { ...r, name: params.name, type: params.type as RoomType, max_guests: params.max_guests, base_price_fcfa: params.base_price_fcfa } : r)
    );
    setSaving(false);
  }, []);

  return { rooms, propertyId, loading, error, createRoom, updateRoom, saving, saveError };
}
