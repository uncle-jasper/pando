import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The public archive feed serves small thumbnails/OG images of Vercel Blob photos through
    // Next's image optimizer (see lib/issues.ts), which requires allow-listing the Blob host.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
