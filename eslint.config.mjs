import { FlatCompat } from '@eslint/eslintrc'
import path from 'path'

const compat = new FlatCompat({
  baseDirectory: path.resolve('.'),
})

export default [
  // on part de la config recommandée par Next.js
  ...compat.config({
    extends: ['next', 'next/core-web-vitals'],
    rules: {
      // désactive l’erreur sur les apostrophes non-échappées
      'react/no-unescaped-entities': 'off',
      // désactive l’erreur TS sur les any explicites
      '@typescript-eslint/no-explicit-any': 'off',
      // désactive l’avertissement sur <img> vs <Image />
      '@next/next/no-img-element': 'off',
      // désactive la vérification des deps manquantes dans useEffect
      'react-hooks/exhaustive-deps': 'off',
    },
  }),
]
