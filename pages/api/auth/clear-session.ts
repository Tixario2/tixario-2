// pages/api/auth/clear-session.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''

  res.setHeader('Set-Cookie', [
    `sb-access-token=; Path=/; Max-Age=0; SameSite=Strict; HttpOnly${secure}`,
    `sb-refresh-token=; Path=/; Max-Age=0; SameSite=Strict; HttpOnly${secure}`,
    `sb-remember-me=; Path=/; Max-Age=0; SameSite=Strict${secure}`,
  ])

  return res.status(200).json({ ok: true })
}
