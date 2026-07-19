import { supabase } from "@/lib/supabase/client";

type UploadImageOptions = {
  bucket: "property-images" | "room-images" | "avatars";
  path: string;
  file: File;
  onProgress?: (pct: number) => void;
};

export async function uploadImageViaSignedUrl(
  signedUrl: string,
  token: string,
  file: File,
): Promise<void> {
  const { error } = await supabase.storage.from("").uploadToSignedUrl(signedUrl, token, file);
  if (error) throw new Error(error.message);
}

export function getPublicUrl(bucket: "property-images" | "room-images" | "avatars", storagePath: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function getSignedUrl(
  bucket: "message-attachments" | "ticket-attachments" | "kyc-documents",
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export function compressImageClientSide(file: File, maxWidthPx = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidthPx) {
        height = Math.round(height * (maxWidthPx / width));
        width = maxWidthPx;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function callEdgeFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json() as { data?: T; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `Edge Function error: ${res.status}`);
  return json.data as T;
}

