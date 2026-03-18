import type { IncomingMessage } from 'http'

const SUPPORTED = ['fr', 'en'] as const
type Locale = typeof SUPPORTED[number]

export function detectLocale(req: IncomingMessage): Locale {
  // 1. Check NEXT_LOCALE cookie
  const cookieHeader = req.headers.cookie ?? ''
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
  if (cookieMatch) {
    const val = cookieMatch[1] as Locale
    if (SUPPORTED.includes(val)) return val
  }

  // 2. Check Accept-Language header
  const acceptLang = req.headers['accept-language'] ?? ''
  for (const segment of acceptLang.split(',')) {
    const lang = segment.trim().split(/[-;]/)[0].toLowerCase() as Locale
    if (SUPPORTED.includes(lang)) return lang
  }

  // 3. Default
  return 'fr'
}
