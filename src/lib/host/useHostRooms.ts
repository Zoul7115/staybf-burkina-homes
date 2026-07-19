import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { callEdgeFunction } from "@/lib/storage";
import type { HostRoomDetail, RoomStatus, RoomType, BedEntry, RoomImage } from "./types";

const ROOM_IMAGES_BUCKET = "room-images";

export function roomImageUrl(storagePath: string): string {
  const { data } = supabase.storage.from(ROOM_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export type RoomFormParams = {
  propertyId: string; name: string; type: string; max_guests: number; base_price_fcfa: number;
};

type RawRoomRow = {
  id: string; property_id: string; name: string; type: string; max_guests: number;
  beds: BedEntry[]; base_price_fcfa: number; status: string; instant_book: boolean;
  created_at: string; updated_at: string;
  room_images: { id: string; storage_path: string; alt: string | null; position: number; is_cover: boolean }[];
};

// ── Fetcher ───────────────────────────────────────────────────

type RoomsPayload = { rooms: HostRoomDetail[]; propertyId: string | null };

async function fetchHostRooms(): Promise<RoomsPayload> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propData, error: propErr } = await (supabase as any)
    .from("properties").select("id").eq("host_id", user.id).is("deleted_at", null);
  if (propErr) throw new Error(propErr.message);

  const propertyIds: string[] = ((propData ?? []) as { id: string }[]).map((p) => p.id);
  if (propertyIds.length === 0) return { rooms: [], propertyId: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roomData, error: roomErr } = await (supabase as any)
    .from("rooms")
    .select(`id,property_id,name,type,max_guests,beds,base_price_fcfa,status,instant_book,created_at,updated_at,room_images(id,storage_path,alt,position,is_cover)`)
    .in("property_id", propertyIds)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (roomErr) throw new Error(roomErr.message);

  const rawRooms = (roomData ?? []) as RawRoomRow[];
  const roomIds = rawRooms.map((r) => r.id);

  if (roomIds.length === 0) return { rooms: [], propertyId: propertyIds[0] };

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bookingsRes, availRes] = await Promise.all([
    (supabase as any).from("bookings").select("room_id").in("room_id", roomIds).in("status", ["confirmed", "checked_in", "completed"]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("room_availability").select("room_id").in("room_id", roomIds).eq("status", "open").gte("date", today).lte("date", in30Days),
  ]);

  const bookingCountByRoom = ((bookingsRes.data ?? []) as { room_id: string }[]).reduce<Record<string, number>>((acc, b) => {
    acc[b.room_id] = (acc[b.room_id] ?? 0) + 1; return acc;
  }, {});
  const openNightsByRoom = ((availRes.data ?? []) as { room_id: string }[]).reduce<Record<string, number>>((acc, a) => {
    acc[a.room_id] = (acc[a.room_id] ?? 0) + 1; return acc;
  }, {});

  const rooms: HostRoomDetail[] = rawRooms.map((r) => ({
    id: r.id, property_id: r.property_id, name: r.name, type: r.type as RoomType,
    max_guests: r.max_guests, beds: (r.beds ?? []) as BedEntry[],
    base_price_fcfa: r.base_price_fcfa, status: r.status as RoomStatus,
    instant_book: r.instant_book, created_at: r.created_at, updated_at: r.updated_at,
    images: [...(r.room_images ?? [])].sort((a, b) => a.position - b.position) as RoomImage[],
    booking_count: bookingCountByRoom[r.id] ?? 0,
    open_nights_next_30: openNightsByRoom[r.id] ?? 0,
  }));

  return { rooms, propertyId: propertyIds[0] };
}

// ── Hook ─────────────────────────────────────────────────────

type UseHostRoomsReturn = {
  rooms: HostRoomDetail[]; propertyId: string | null;
  loading: boolean; error: string | null;
  createRoom: (params: RoomFormParams) => Promise<void>;
  updateRoom: (id: string, params: Omit<RoomFormParams, "propertyId">) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  addRoomImage: (roomId: string, file: File, isCover: boolean) => Promise<void>;
  saving: boolean; saveError: string | null;
};

export function useHostRooms(): UseHostRoomsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.hostRooms();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchHostRooms });

  const createMutation = useMutation({
    mutationFn: async (params: RoomFormParams) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: dbErr } = await (supabase as any)
        .from("rooms")
        .insert({ property_id: params.propertyId, name: params.name, type: params.type, max_guests: params.max_guests, base_price_fcfa: params.base_price_fcfa, status: "active", instant_book: false, beds: [] })
        .select("id,property_id,name,type,max_guests,beds,base_price_fcfa,status,instant_book,created_at,updated_at")
        .single();
      if (dbErr) throw new Error(dbErr.message);
      return row as RawRoomRow;
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<RoomsPayload>(KEY);
      const tempRoom: HostRoomDetail = {
        id: `temp-${Date.now()}`, property_id: params.propertyId, name: params.name,
        type: params.type as RoomType, max_guests: params.max_guests, beds: [], base_price_fcfa: params.base_price_fcfa,
        status: "active", instant_book: false, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), images: [], booking_count: 0, open_nights_next_30: 0,
      };
      queryClient.setQueryData<RoomsPayload>(KEY, (old) => old ? { ...old, rooms: [...old.rooms, tempRoom] } : old);
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, params }: { id: string; params: Omit<RoomFormParams, "propertyId"> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("rooms").update({ name: params.name, type: params.type, max_guests: params.max_guests, base_price_fcfa: params.base_price_fcfa }).eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ id, params }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<RoomsPayload>(KEY);
      queryClient.setQueryData<RoomsPayload>(KEY, (old) => {
        if (!old) return old;
        return { ...old, rooms: old.rooms.map((r) => r.id === id ? { ...r, name: params.name, type: params.type as RoomType, max_guests: params.max_guests, base_price_fcfa: params.base_price_fcfa } : r) };
      });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (roomId: string) => {
      await callEdgeFunction("delete-room", { room_id: roomId });
    },
    onMutate: async (roomId) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<RoomsPayload>(KEY);
      queryClient.setQueryData<RoomsPayload>(KEY, (old) =>
        old ? { ...old, rooms: old.rooms.filter((r) => r.id !== roomId) } : old
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const addRoomImageMutation = useMutation({
    mutationFn: async ({ roomId, file, isCover }: { roomId: string; file: File; isCover: boolean }) => {
      const { signedUrl, storagePath } = await callEdgeFunction<{ signedUrl: string; storagePath: string; token: string; image: RoomImage }>(
        "upload-room-image",
        { room_id: roomId, file_name: file.name, content_type: file.type, file_size_bytes: file.size, is_cover: isCover }
      );
      await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      return { roomId, storagePath, isCover };
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const saving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const saveError = (createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? addRoomImageMutation.error)?.message ?? null;

  return {
    rooms: data?.rooms ?? [], propertyId: data?.propertyId ?? null,
    loading: isLoading, error: error?.message ?? null,
    createRoom: (params) => createMutation.mutateAsync(params).then(() => undefined),
    updateRoom: (id, params) => updateMutation.mutateAsync({ id, params }),
    deleteRoom: (id) => deleteMutation.mutateAsync(id).then(() => undefined),
    addRoomImage: (roomId, file, isCover) => addRoomImageMutation.mutateAsync({ roomId, file, isCover }).then(() => undefined),
    saving, saveError,
  };
}
