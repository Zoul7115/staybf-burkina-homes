import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FavoriteProperty = {
  favoriteId: string;
  id: string;
  name: string;
  address: string | null;
  city_name: string | null;
  min_price_fcfa: number | null;
  rating_avg: number | null;
  rating_count: number;
  cover_image_url: string;
};

type RawFavoriteRow = {
  id: string;
  properties: {
    id: string;
    name: string;
    address: string | null;
    min_price_fcfa: number | null;
    rating_avg: number | null;
    rating_count: number;
    status: string;
    deleted_at: string | null;
    cities: { name: string } | null;
    property_images: { storage_path: string; is_cover: boolean; position: number }[];
  } | null;
};

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchFavorites(): Promise<FavoriteProperty[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("favorites")
    .select(`id,properties!property_id(id,name,address,min_price_fcfa,rating_avg,rating_count,status,deleted_at,cities!city_id(name),property_images(storage_path,is_cover,position))`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return [];

  return ((data ?? []) as RawFavoriteRow[])
    .filter((row) => row.properties && row.properties.status === "published" && !row.properties.deleted_at)
    .map((row) => {
      const p = row.properties!;
      const city = Array.isArray(p.cities) ? (p.cities[0] ?? null) : p.cities;
      const sorted = (p.property_images ?? []).sort((a, b) => a.position - b.position);
      const cover = sorted.find((img) => img.is_cover) ?? sorted[0] ?? null;
      return {
        favoriteId: row.id,
        id: p.id,
        name: p.name,
        address: p.address,
        city_name: city?.name ?? null,
        min_price_fcfa: p.min_price_fcfa,
        rating_avg: p.rating_avg,
        rating_count: p.rating_count ?? 0,
        cover_image_url: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
      };
    });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFavorites(): {
  items: FavoriteProperty[];
  loading: boolean;
  remove: (favoriteId: string) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const KEY = queryKeys.travelerFavorites();

  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: fetchFavorites });

  const removeMutation = useMutation({
    mutationFn: async (favoriteId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("favorites").delete().eq("id", favoriteId).eq("user_id", user.id);
    },
    onMutate: async (favoriteId) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<FavoriteProperty[]>(KEY);
      queryClient.setQueryData<FavoriteProperty[]>(KEY, (old) => (old ?? []).filter((item) => item.favoriteId !== favoriteId));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return { items: data ?? [], loading: isLoading, remove: removeMutation.mutateAsync };
}
