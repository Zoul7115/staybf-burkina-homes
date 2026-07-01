import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFavorites(): {
  items: FavoriteProperty[];
  loading: boolean;
  remove: (favoriteId: string) => Promise<void>;
} {
  const [items, setItems] = useState<FavoriteProperty[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("favorites")
      .select(`
        id,
        properties!property_id(
          id,
          name,
          address,
          min_price_fcfa,
          rating_avg,
          rating_count,
          status,
          deleted_at,
          cities!city_id(name),
          property_images(storage_path, is_cover, position)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setItems([]);
      setLoading(false);
      return;
    }

    const favorites: FavoriteProperty[] = ((data ?? []) as {
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
    }[])
      .filter((row) => row.properties && row.properties.status === "published" && !row.properties.deleted_at)
      .map((row) => {
        const p = row.properties!;
        const sorted = (p.property_images ?? []).sort((a, b) => a.position - b.position);
        const cover = sorted.find((img) => img.is_cover) ?? sorted[0] ?? null;
        return {
          favoriteId: row.id,
          id: p.id,
          name: p.name,
          address: p.address,
          city_name: p.cities?.name ?? null,
          min_price_fcfa: p.min_price_fcfa,
          rating_avg: p.rating_avg,
          rating_count: p.rating_count ?? 0,
          cover_image_url: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
        };
      });

    setItems(favorites);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = useCallback(async (favoriteId: string) => {
    setItems((prev) => prev.filter((item) => item.favoriteId !== favoriteId));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("favorites")
      .delete()
      .eq("id", favoriteId)
      .eq("user_id", user.id);
  }, []);

  return { items, loading, remove };
}
