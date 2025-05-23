import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["upload.wikimedia.org"],
  },
  eslint: {
    // Ignore les erreurs ESLint durant la build (ne bloque plus next build)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
