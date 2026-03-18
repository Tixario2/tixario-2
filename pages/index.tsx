// pages/index.tsx
import { useState, useRef, useEffect } from 'react'
import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import EventCarousel from '@/components/EventCarousel'
import { supabase } from '@/supabaseClient'
import { buildEventData, FeaturedEvent, SearchItem } from '@/lib/eventUtils'

interface HomeProps {
  searchItems: SearchItem[]
  featured: FeaturedEvent[]
  concerts: FeaturedEvent[]
  sports: FeaturedEvent[]
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ locale }) => {
  const { data: rows } = await supabase
    .from('billets')
    .select('evenement, slug, date, ville, pays, categorie, prix, image, logo_artiste, type')
    .order('date', { ascending: true })

  // Filter out paused/archived events
  const { data: hiddenMeta } = await supabase
    .from('event_meta')
    .select('slug')
    .or('paused.eq.true,archived.eq.true')

  const hiddenSlugs = new Set((hiddenMeta ?? []).map(m => m.slug))
  const visibleRows = (rows ?? []).filter(r => !hiddenSlugs.has(r.slug))

  const { searchItems, featured: all } = buildEventData(visibleRows)
  const featured = all.slice(0, 12)
  const featuredSlugs = new Set(featured.map(e => e.slugEvent))

  const sortWithDedup = (events: FeaturedEvent[]) =>
    [...events].sort((a, b) => {
      const aShown = featuredSlugs.has(a.slugEvent) ? 1 : 0
      const bShown = featuredSlugs.has(b.slugEvent) ? 1 : 0
      return aShown - bShown
    })

  const concerts = sortWithDedup(
    all.filter(e => e.type === 'concert')
  ).slice(0, 6)

  const sports = sortWithDedup(
    all.filter(e => e.type === 'sport')
  ).slice(0, 6)

  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'fr', ['common'])),
      searchItems,
      featured,
      concerts,
      sports,
    },
  }
}

// ─── Hero Search ──────────────────────────────────────────────────────────────

interface HeroSearchResult {
  slugEvent: string
  nom: string
  ville: string
  date: string
  image: string | null
}

interface HeroPopularEvent {
  slugEvent: string
  nom: string
  ville: string
  image: string | null
}

function HeroSearch({ items, t }: { items: SearchItem[]; t: (k: string) => string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<HeroSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [popularEvents, setPopularEvents] = useState<HeroPopularEvent[]>([])
  const [popularLoaded, setPopularLoaded] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const locale = router.locale ?? 'fr'

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zenntry_recent_searches')
      if (saved) setRecentSearches(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Fetch popular events when dropdown opens with no query
  useEffect(() => {
    if (!open || query.trim() || popularLoaded) return
    ;(async () => {
      try {
        const { data } = await supabase
          .from('billets')
          .select('evenement, slug, ville, image, quantite, date')
          .order('date', { ascending: true })
          .limit(200)
        if (!data) return
        const now = Date.now()
        const groups = new Map<string, { nom: string; ville: string; image: string | null; totalQty: number; closestDate: number }>()
        for (const r of data) {
          const slugEvent = r.slug as string
          const qty = parseInt(String(r.quantite ?? '0'), 10) || 0
          const dateMs = r.date ? new Date(r.date as string).getTime() : now
          const existing = groups.get(slugEvent)
          if (existing) {
            existing.totalQty += qty
            if (Math.abs(dateMs - now) < Math.abs(existing.closestDate - now)) {
              existing.closestDate = dateMs
            }
          } else {
            groups.set(slugEvent, {
              nom: r.evenement as string,
              ville: (r.ville as string) ?? '',
              image: (r.image as string | null) ?? null,
              totalQty: qty,
              closestDate: dateMs,
            })
          }
        }
        const entries = Array.from(groups.entries())
        const sortedByDate = [...entries].sort((a, b) => Math.abs(a[1].closestDate - now) - Math.abs(b[1].closestDate - now))
        const recencyMap = new Map<string, number>()
        sortedByDate.forEach(([slug], i) => recencyMap.set(slug, entries.length - i))
        const sortedByQty = [...entries].sort((a, b) => b[1].totalQty - a[1].totalQty)
        const qtyMap = new Map<string, number>()
        sortedByQty.forEach(([slug], i) => qtyMap.set(slug, entries.length - i))
        entries.sort((a, b) => {
          const scoreA = (qtyMap.get(a[0]) ?? 0) * 0.6 + (recencyMap.get(a[0]) ?? 0) * 0.4
          const scoreB = (qtyMap.get(b[0]) ?? 0) * 0.6 + (recencyMap.get(b[0]) ?? 0) * 0.4
          return scoreB - scoreA
        })
        setPopularEvents(entries.slice(0, 12).map(([slugEvent, g]) => ({
          slugEvent,
          nom: g.nom,
          ville: g.ville,
          image: g.image,
        })))
        setPopularLoaded(true)
      } catch { /* ignore */ }
    })()
  }, [open, query, popularLoaded])

  // Live search with 200ms debounce — smart multi-field search
  useEffect(() => {
    const q = query.trim()
    if (!q) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const ql = q.toLowerCase()
        const { data } = await supabase
          .from('billets')
          .select('evenement, slug, date, ville, pays, categorie, image')
          .or(`evenement.ilike.%${q}%,ville.ilike.%${q}%,pays.ilike.%${q}%,categorie.ilike.%${q}%`)
          .order('date', { ascending: true })
          .limit(40)
        if (data) {
          const seen = new Map<string, HeroSearchResult & { priority: number }>()
          for (const r of data) {
            const slugEvent = r.slug as string
            if (seen.has(slugEvent)) continue
            const nom = (r.evenement as string) ?? ''
            const ville = (r.ville as string) ?? ''
            const pays = (r.pays as string) ?? ''
            const categorie = (r.categorie as string) ?? ''
            const nomL = nom.toLowerCase()
            let priority = 7
            if (nomL.startsWith(ql)) priority = 1
            else if (nomL.includes(ql)) priority = 2
            else if (ville.toLowerCase().includes(ql)) priority = 3
            else if (pays.toLowerCase().includes(ql)) priority = 4
            else if (categorie.toLowerCase().includes(ql)) priority = 6
            seen.set(slugEvent, {
              slugEvent,
              nom,
              ville,
              date: (r.date as string) ?? '',
              image: (r.image as string | null) ?? null,
              priority,
            })
          }
          const results = Array.from(seen.values())
            .sort((a, b) => a.priority - b.priority)
            .slice(0, 12)
          setSearchResults(results)
        }
      } finally { setSearching(false) }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Helpers
  const saveRecent = (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    setRecentSearches(prev => {
      const updated = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, 5)
      localStorage.setItem('zenntry_recent_searches', JSON.stringify(updated))
      return updated
    })
  }
  const clearRecents = () => {
    localStorage.removeItem('zenntry_recent_searches')
    setRecentSearches([])
  }
  const getInitial = (name: string) => name.charAt(0).toUpperCase()

  const fmtDate = (iso: string) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric', month: 'short',
      })
    } catch { return '' }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    saveRecent(q); setOpen(false)
    router.push(`/?q=${encodeURIComponent(q)}`)
  }

  const navigateToResult = (result: HeroSearchResult) => {
    saveRecent(query.trim() || result.nom)
    setOpen(false); setQuery('')
    router.push(`/${result.slugEvent}`)
  }

  const navigateFromRecent = (term: string) => {
    saveRecent(term); setOpen(false)
    router.push(`/?q=${encodeURIComponent(term)}`)
  }

  const showDropdown = open

  return (
    <div className="hp-search" ref={containerRef}>
      <form onSubmit={handleSubmit} className="hp-search__form">
        <svg className="hp-search__icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search artist or event..."
          className="hp-search__input"
          autoComplete="off"
        />
      </form>

      {showDropdown && (
        <div className="hp-search__dropdown">
          {query.trim().length === 0 ? (
            <>
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="hp-search__section">
                  <div className="hp-search__section-head">
                    <span className="hp-search__section-label">Recent searches</span>
                    <button className="hp-search__section-clear" type="button" onClick={clearRecents}>Clear</button>
                  </div>
                  {recentSearches.map(term => (
                    <button key={term} type="button" className="hp-search__row"
                      onClick={() => navigateFromRecent(term)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="hp-search__row-text">{term}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Popular events */}
              {popularEvents.length > 0 && (
                <div className="hp-search__section">
                  <div className="hp-search__section-head">
                    <span className="hp-search__section-label">Popular events</span>
                  </div>
                  {popularEvents.map(ev => (
                    <button key={ev.slugEvent} type="button" className="hp-search__row"
                      onClick={() => { saveRecent(ev.nom); setOpen(false); setQuery(''); router.push(`/${ev.slugEvent}`) }}>
                      <span className="hp-search__thumb">
                        {ev.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/images/events/${ev.image}`} alt="" className="hp-search__thumb-img" />
                        ) : (
                          <span className="hp-search__thumb-initial">{getInitial(ev.nom)}</span>
                        )}
                      </span>
                      <span className="hp-search__row-info">
                        <span className="hp-search__row-name">{ev.nom}</span>
                        {ev.ville && <span className="hp-search__row-sub">{ev.ville}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : searching ? (
            <div className="hp-search__empty">Searching…</div>
          ) : searchResults.length > 0 ? (
            <div className="hp-search__section">
              <div className="hp-search__section-head">
                <span className="hp-search__section-label">Events</span>
              </div>
              {searchResults.map(result => (
                <button key={result.slugEvent} type="button" className="hp-search__row"
                  onClick={() => navigateToResult(result)}>
                  <span className="hp-search__thumb">
                    {result.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/images/events/${result.image}`} alt="" className="hp-search__thumb-img" />
                    ) : (
                      <span className="hp-search__thumb-initial">{getInitial(result.nom)}</span>
                    )}
                  </span>
                  <span className="hp-search__row-info">
                    <span className="hp-search__row-name">{result.nom}</span>
                    <span className="hp-search__row-sub">
                      {result.ville}{result.ville && result.date ? ' · ' : ''}{fmtDate(result.date)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="hp-search__empty">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              Not in our current selection —{' '}
              <Link href={`/request?event=${encodeURIComponent(query.trim())}`}
                className="hp-search__empty-link" onClick={() => setOpen(false)}>
                Request access →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home({ searchItems, featured, concerts, sports }: HomeProps) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const locale = router.locale ?? 'fr'

  const trustIcons = [
    <svg key="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
    <svg key="lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>,
    <svg key="chat" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>,
  ]

  return (
    <>
      <Header transparent={true} />

      {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
      <section className="hp-hero">
        <div className="hp-hero__inner">
          <h1 className="hp-hero__h1">
            Premium access
            <br />
            <em className="hp-hero__h1-em">to live events.</em>
          </h1>
          <p className="hp-hero__sub">{t('home.hero_sub')}</p>
          <HeroSearch items={searchItems} t={t} />
          <p className="hp-hero__cant-find">
            Can&apos;t find what you&apos;re looking for?{' '}
            <Link href="/request" className="hp-hero__cant-find-link">
              Make a request →
            </Link>
          </p>
        </div>
      </section>

      {/* ── 2. Dark zone: Popular events + trust strip ─────────────── */}
      <section className="hp-dark" id="popular-events">
        <div className="hp-dark__fade" />
        <div className="hp-dark__row">
          <EventCarousel title="Popular events" events={featured} locale={locale} />
        </div>
        <div className="hp-strip">
          {(['home.micro_trust_1', 'home.micro_trust_2', 'home.micro_trust_3'] as const).map((key, i) => (
            <div key={key} className="hp-strip__pill">
              <span className="hp-strip__icon">{trustIcons[i]}</span>
              <span>{t(key)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Concerts (light) ───────────────────────────────────────── */}
      {concerts.length > 0 && (
        <section className="hp-light">
          <EventCarousel title="Concerts" exploreLink="/concerts" exploreLinkLabel="View all concerts &rarr;" events={concerts} locale={locale} light />
        </section>
      )}

      {/* ── 3b. Sports (light) ────────────────────────────────────────── */}
      {sports.length > 0 && (
        <section className="hp-light">
          <EventCarousel title="Sports" exploreLink="/sports" exploreLinkLabel="View all sports &rarr;" events={sports} locale={locale} light />
        </section>
      )}

      {/* ── 4. How it works ─────────────────────────────────────────────── */}
      <section className="hp-hiw">
        <div className="hp-hiw__inner">
          <h2 className="hp-section-title hp-section-title--center">{t('home.how_it_works')}</h2>

          <div className="hp-steps">
            {([1, 2, 3] as const).map(n => (
              <div key={n} className="hp-step">
                <p className="hp-step__num">{t(`home.step_num_${n}`)}</p>
                <h3 className="hp-step__title">{t(`home.step_${n}_title`)}</h3>
                <p className="hp-step__body">{t(`home.step_${n}_body`)}</p>
              </div>
            ))}
          </div>

          <div className="hp-guarantee">
            {([1, 2, 3, 4] as const).map(n => (
              <div key={n} className="hp-guarantee__item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{t(`home.guarantee_${n}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Request band ─────────────────────────────────────────────── */}
      <section className="hp-request">
        <div className="hp-request__inner">
          <div className="hp-request__left">
            <h2 className="hp-request__title">{t('home.request_title')}</h2>
            <p className="hp-request__sub">{t('home.request_sub')}</p>
          </div>
          <div className="hp-request__right">
            <Link href="/request" className="hp-request__btn">{t('home.request_cta')}</Link>
          </div>
        </div>
      </section>

      <Footer />

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        /* ── Tokens ───────────────────────────────────────── */
        :root {
          --hp-bg:     #FAFAF8;
          --hp-green:  #1a3a2a;
          --hp-green2: #15302a;
          --hp-text:   #111111;
          --hp-border: #E5E5E0;
          --hp-muted:  #6b7280;
          --hp-serif:  'Cormorant Garamond', Georgia, serif;
          --hp-sans:   'Inter', system-ui, sans-serif;
        }

        /* ── Hero ─────────────────────────────────────────── */
        .hp-hero {
          position: relative;
          background-image: url('/images/hero-bg.jpg');
          background-size: cover;
          background-position: center;
          color: white;
          height: 58vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0 1.5rem;
          margin-top: -64px;
          overflow: visible;
        }
        .hp-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.5) 0%,
            rgba(0,0,0,0.35) 40%,
            rgba(0,0,0,0.6) 100%
          );
          pointer-events: none;
        }
        .hp-hero__inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .hp-hero__h1 {
          font-family: var(--hp-serif);
          font-size: clamp(44px, 6vw, 72px);
          font-weight: 400;
          line-height: 1.1;
          margin: 0 0 1rem;
          color: white;
        }
        .hp-hero__h1-em {
          font-style: italic;
          font-weight: 400;
          color: rgba(255,255,255,0.72);
        }
        .hp-hero__sub {
          font-family: var(--hp-sans);
          font-size: 15px;
          font-weight: 300;
          color: rgba(255,255,255,0.55);
          line-height: 1.65;
          max-width: 400px;
          text-align: center;
          margin: 0 0 28px;
        }
        .hp-hero__cant-find {
          margin-top: 1.25rem;
          font-size: 13px;
          color: rgba(255,255,255,0.45);
          font-family: var(--hp-sans);
        }
        .hp-hero__cant-find-link {
          color: rgba(255,255,255,0.7);
          text-decoration: none;
          transition: color 0.15s;
        }
        .hp-hero__cant-find-link:hover { color: white; }

        /* ── Hero search ──────────────────────────────────── */
        .hp-search {
          position: relative;
          z-index: 400;
          max-width: 560px;
          width: 90%;
          margin: 0 auto;
        }
        .hp-search__form {
          display: flex;
          align-items: center;
          background: white;
          border-radius: 6px;
          padding: 0 1rem;
          height: 52px;
          gap: 0.625rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.2);
        }
        .hp-search__icon { color: #9ca3af; flex-shrink: 0; }
        .hp-search__input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.9375rem;
          color: var(--hp-text);
          font-family: var(--hp-sans);
          background: transparent;
          min-width: 0;
        }
        .hp-search__input::placeholder { color: #9ca3af; }
        .hp-search__dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 10px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.2);
          overflow-y: auto;
          max-height: 420px;
          z-index: 400;
          text-align: left;
        }
        .hp-search__section + .hp-search__section { border-top: 1px solid #f0f0ee; }
        .hp-search__section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px 6px;
        }
        .hp-search__section-label {
          font-family: var(--hp-sans);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #999999;
        }
        .hp-search__section-clear {
          font-family: var(--hp-sans);
          font-size: 11px;
          font-weight: 500;
          color: #9ca3af;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
        }
        .hp-search__section-clear:hover { color: #111111; }
        .hp-search__row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 12px;
          width: 100%;
          height: 52px;
          padding: 0 16px;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: none;
          font-family: var(--hp-sans);
          transition: background 0.1s;
          text-align: left;
          color: #111111;
        }
        .hp-search__row:hover { background: #f7f7f5; }
        .hp-search__row-text {
          font-size: 14px;
          color: #111111;
          font-family: var(--hp-sans);
        }
        .hp-search__thumb {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #1a3a2a;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .hp-search__thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .hp-search__thumb-initial {
          font-family: var(--hp-serif);
          font-size: 14px;
          font-weight: 600;
          color: white;
          line-height: 1;
        }
        .hp-search__row-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
          text-align: left;
        }
        .hp-search__row-name {
          font-family: var(--hp-sans);
          font-size: 14px;
          font-weight: 500;
          color: #111111;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hp-search__row-sub {
          font-family: var(--hp-sans);
          font-size: 12px;
          color: #999999;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hp-search__empty {
          padding: 16px;
          font-family: var(--hp-sans);
          font-size: 0.875rem;
          color: #9ca3af;
        }
        .hp-search__empty-link {
          color: #1a3a2a;
          font-weight: 500;
          text-decoration: none;
        }
        .hp-search__empty-link:hover { text-decoration: underline; }

        /* ── Dark events zone ─────────────────────────────── */
        .hp-dark {
          background: #0d0d0d;
          padding: 0 48px 0;
        }
        .hp-dark__fade {
          height: 60px;
          background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, #0d0d0d 100%);
          margin: 0 -48px;
        }
        .hp-dark__row {
          padding: 80px 0;
        }

        /* ── Light carousel section ───────────────────────── */
        .hp-light {
          background: #FAFAF8;
          padding: 60px 48px;
        }
        .hp-light + .hp-light {
          padding-top: 0;
        }

        /* ── Trust strip ────────────────────────────────────── */
        .hp-strip {
          background: #161616;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          margin: 0 -48px;
          padding: 0;
        }
        .hp-strip__pill {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.9rem 2rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          font-family: var(--hp-sans);
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .hp-strip__pill:last-child { border-right: none; }
        .hp-strip__icon { color: rgba(255,255,255,0.4); display: flex; }

        /* ── Shared section title ─────────────────────────── */
        .hp-section-title {
          font-family: var(--hp-serif);
          font-size: 2.25rem;
          font-weight: 600;
          color: var(--hp-text);
          margin: 0 0 0.5rem;
        }
        .hp-section-title--center { text-align: center; }

        /* ── How it works ─────────────────────────────────── */
        .hp-hiw {
          background: #FAFAF8;
          border-bottom: 1px solid var(--hp-border);
          padding: 2rem 1.5rem 5rem;
        }
        .hp-hiw__inner { max-width: 900px; margin: 0 auto; }
        .hp-steps {
          display: flex;
          align-items: flex-start;
          margin-bottom: 3.5rem;
        }
        .hp-step {
          flex: 1;
          padding: 0 2.5rem;
          text-align: left;
        }
        .hp-step + .hp-step {
          border-left: 1px solid var(--hp-border);
        }
        .hp-step:first-child { padding-left: 0; }
        .hp-step:last-child { padding-right: 0; }
        .hp-step__num {
          font-family: var(--hp-serif);
          font-size: 3.5rem;
          font-weight: 300;
          color: rgba(26, 58, 42, 0.13);
          line-height: 1;
          margin: 0 0 0.75rem;
        }
        .hp-step__title {
          font-family: var(--hp-serif);
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--hp-text);
          margin: 0 0 0.5rem;
        }
        .hp-step__body {
          font-size: 0.875rem;
          color: var(--hp-muted);
          line-height: 1.65;
          margin: 0;
          font-family: var(--hp-sans);
        }
        .hp-guarantee {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          background: var(--hp-bg);
          border: 1px solid var(--hp-border);
          border-radius: 12px;
          padding: 2rem;
        }
        .hp-guarantee__item {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--hp-text);
          font-family: var(--hp-sans);
        }

        /* ── Request band ─────────────────────────────────── */
        .hp-request {
          background: var(--hp-green);
          color: white;
          padding: 4.5rem 1.5rem;
        }
        .hp-request__inner {
          max-width: 900px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 3rem;
        }
        .hp-request__left { flex: 1; }
        .hp-request__title {
          font-family: var(--hp-serif);
          font-size: clamp(1.75rem, 3vw, 2.5rem);
          font-weight: 600;
          margin: 0 0 0.75rem;
          color: white;
        }
        .hp-request__sub {
          font-size: 0.9375rem;
          color: rgba(255,255,255,0.6);
          max-width: 440px;
          line-height: 1.65;
          font-family: var(--hp-sans);
          margin: 0;
        }
        .hp-request__right { flex-shrink: 0; }
        .hp-request__btn {
          display: inline-block;
          background: white;
          color: var(--hp-green);
          padding: 0.9rem 2.5rem;
          border-radius: 8px;
          font-size: 0.9375rem;
          font-weight: 600;
          text-decoration: none;
          font-family: var(--hp-sans);
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .hp-request__btn:hover { opacity: 0.9; }

        /* ── Mobile ───────────────────────────────────────── */
        @media (max-width: 640px) {
          .hp-strip__pill { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
          .hp-strip__pill:last-child { border-bottom: none; }
          .hp-steps { flex-direction: column; gap: 2rem; }
          .hp-step { border-left: none !important; padding: 0 !important; }
          .hp-step + .hp-step { border-top: 1px solid var(--hp-border); padding-top: 2rem; }
          .hp-guarantee { grid-template-columns: 1fr; }
          .hp-request__inner { flex-direction: column; text-align: center; }
          .hp-request__sub { max-width: 100%; }
          .hp-dark { padding: 0 16px 0; }
          .hp-dark__fade { margin: 0 -16px; }
          .hp-strip { margin: 0 -16px; }
          .hp-light { padding: 60px 16px; }
        }
      `}</style>
    </>
  )
}
