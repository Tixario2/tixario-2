// .eslintrc.js
module.exports = {
  extends: ['next/core-web-vitals', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // supprime l'erreur sur les apostrophes non-échappées
    'react/no-unescaped-entities': 'off',
    // supprime l'erreur TS sur les any explicites
    '@typescript-eslint/no-explicit-any': 'off',
    // supprime l'avertissement sur <img> vs <Image>
    '@next/next/no-img-element': 'off',
    // supprime la vérification des deps manquantes dans useEffect
    'react-hooks/exhaustive-deps': 'off',
  },
}

