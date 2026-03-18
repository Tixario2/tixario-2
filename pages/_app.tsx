// pages/_app.tsx
import '@/styles/globals.css'
import { useEffect } from 'react'
import type { AppProps } from 'next/app'
import { CartProvider } from '@/context/cartContext'
import { appWithTranslation } from 'next-i18next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function App({ Component, pageProps }: AppProps) {
  // Keep auth cookies fresh when Supabase auto-refreshes the token client-side
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session) {
          const rememberMe = localStorage.getItem('zenntry_remember_me') === 'true'
          console.log(`[_app] TOKEN_REFRESHED — updating cookies (rememberMe=${rememberMe})`)
          await fetch('/api/auth/set-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              remember_me: rememberMe,
            }),
          })
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  return (
    <CartProvider>
      <Component {...pageProps} />
    </CartProvider>
  )
}

export default appWithTranslation(App, require('../next-i18next.config'))
