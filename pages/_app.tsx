// pages/_app.tsx
import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { CartProvider } from '@/context/cartContext'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <CartProvider>
      <Component {...pageProps} />
    </CartProvider>
  )
}
