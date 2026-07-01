import { supabase } from "@/lib/supabase/client";

export const PLACEHOLDER_IMG = "https://placehold.co/800x500?text=StayBF";

const IMAGE_BUCKET = "property-images";

export function toPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? PLACEHOLDER_IMG;
}

type ImageLike = { storage_path: string; is_cover: boolean; position: number };

export function coverImageUrl(images: ImageLike[]): string {
  const sorted = [...images].sort((a, b) => a.position - b.position);
  const cover = sorted.find((img) => img.is_cover) ?? sorted[0] ?? null;
  return cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG;
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatResponseTime(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  if (minutes < 60) return "moins d'une heure";
  if (minutes < 240) return "quelques heures";
  if (minutes < 1440) return "dans la journée";
  return "quelques jours";
}
