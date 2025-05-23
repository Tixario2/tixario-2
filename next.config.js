// next.config.js
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    domains: ['upload.wikimedia.org'],
  },
  // On retire la désactivation globale d’ESLint pour retrouver les contrôles de lint maintenant que
  // tout le code est corrigé.
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
}
