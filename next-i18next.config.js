module.exports = {
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
  },
  defaultNS: 'common',
  ns: ['common'],
  reloadOnPrerender: process.env.NODE_ENV === 'development',
}
