import { put } from "@vercel/blob";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadImage(file: File): Promise<{ url: string }> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use PNG, JPEG, GIF, or WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image is too large (8MB max).");
  }

  const ext = file.type.split("/")[1];
  const pathname = `campaign-images/${randomUUID()}.${ext}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
  });

  return { url: blob.url };
}
