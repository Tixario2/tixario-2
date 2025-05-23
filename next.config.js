/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    domains: ["upload.wikimedia.org"],
  },
  eslint: {
    // Ignore toutes les erreurs ESLint pendant la build
    ignoreDuringBuilds: true,
  },
}
