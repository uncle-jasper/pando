"use client";

// Resizes/compresses an image in the browser before it's ever uploaded. This fixes two
// things at once: (1) Vercel serverless functions cap request bodies at ~4.5MB, so a raw
// phone photo (often 3-8MB+) could fail the upload before it even reaches our API route —
// this is why gallery/hero uploads could silently fail with no server-side trace; and
// (2) it keeps Vercel Blob's free-tier 1GB storage from filling up fast, since email display
// sizes never need anywhere near a phone camera's native resolution.
const MAX_DIMENSION = 1600; // generous for retina at every size we display images (hero/inline/gallery)
const JPEG_QUALITY = 0.82;

function hasRealTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

export async function resizeImageFile(file: File): Promise<File> {
  // Animated GIFs would be flattened to a single frame by canvas resizing — pass them
  // through untouched rather than silently killing the animation.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  if (scale === 1 && file.size < 1_500_000) {
    // Already small and already the right size — resizing would only cost time/quality.
    bitmap.close();
    return file;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // PNG is only worth keeping when the image actually uses transparency — PNG is lossless
  // and compresses photographic content far worse than JPEG. A PNG screenshot/graphic with
  // no alpha channel gets re-encoded as JPEG too, same as any photo.
  const keepPng = file.type === "image/png" && hasRealTransparency(ctx, width, height);
  const outputType = keepPng ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? JPEG_QUALITY : undefined;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image."))), outputType, quality);
  });

  const ext = outputType === "image/png" ? "png" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
  return new File([blob], name, { type: outputType });
}
