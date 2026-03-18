// next.config.js
const { i18n } = require('./next-i18next.config')

/** @type {import('next').NextConfig} */
module.exports = {
  i18n,
  reactStrictMode: true,
  images: {
    domains: ['upload.wikimedia.org', 'efkwqqtxlvnsgtdaobsl.supabase.co'],
  },
  // On retire la désactivation globale d’ESLint pour retrouver les contrôles de lint maintenant que
  // tout le code est corrigé.
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
}
