// lib/authGuard.ts
import type { GetServerSidePropsContext } from 'next'
import { createClient } from '@supabase/supabase-js'
import { supabaseServer } from './supabaseServer'

const LOGIN_REDIRECT = { redirect: { destination: '/dashboard/login', permanent: false } } as const

/**
 * Validates the user session from cookies.
 * If the access token is expired but a refresh token exists, refreshes the session
 * and sets updated cookies on the response.
 *
 * Returns the authenticated user or null.
 */
export async function getAuthUser(ctx: GetServerSidePropsContext) {
  const { req, res } = ctx
  const accessToken = req.cookies['sb-access-token']
  const refreshToken = req.cookies['sb-refresh-token']
  const rememberMe = req.cookies['sb-remember-me'] === 'true'

  if (!accessToken && !refreshToken) return null

  // Try the access token first
  if (accessToken) {
    const { data: { user }, error } = await supabaseServer.auth.getUser(accessToken)
    if (!error && user) return user
  }

  // Access token expired or missing — try refreshing with refresh token
  if (!refreshToken) return null

  const anonClient = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // setSession triggers a refresh when the access token is expired
  const { data: { session }, error: refreshError } = await anonClient.auth.setSession({
    access_token: accessToken || '',
    refresh_token: refreshToken,
  })

  if (refreshError || !session) {
    console.log('[authGuard] Refresh failed:', refreshError?.message)
    return null
  }

  // Update cookies with fresh tokens
  const maxAge = rememberMe ? 2592000 : 86400
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''

  res.setHeader('Set-Cookie', [
    `sb-access-token=${session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly${secure}`,
    `sb-refresh-token=${session.refresh_token}; Path=/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly${secure}`,
  ])

  console.log('[authGuard] Token refreshed for user:', session.user.email)

  return session.user
}

export { LOGIN_REDIRECT }
