import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["upload.wikimedia.org"],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // … ta config existante
  eslint: {
    // NE bloque PAS la build en cas d'erreur ESLint
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
