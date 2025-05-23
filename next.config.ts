import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["upload.wikimedia.org"],
  },
  // ← on ajoute bien IGNORE pendant la build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
