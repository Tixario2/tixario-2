// pages/api/auth/set-session.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { access_token, refresh_token, remember_me } = req.body

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'access_token and refresh_token are required' })
  }

  const maxAge = remember_me ? 2592000 : 86400 // 30 days vs 24 hours
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''

  console.log(`[set-session] Setting cookies — remember_me=${remember_me}, max-age=${maxAge}`)

  res.setHeader('Set-Cookie', [
    `sb-access-token=${access_token}; Path=/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly${secure}`,
    `sb-refresh-token=${refresh_token}; Path=/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly${secure}`,
    `sb-remember-me=${remember_me ? 'true' : 'false'}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure}`,
  ])

  return res.status(200).json({ ok: true })
}
