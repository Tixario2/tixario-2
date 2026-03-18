// components/Header.tsx
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next'
import { supabase } from '@/supabaseClient'
import { useCart } from '@/context/cartContext'

type Currency = 'EUR' | 'USD'
type Locale = 'fr' | 'en'
type ModalTab = 'lang' | 'currency'

interface HeaderProps {
  transparent?: boolean
}

interface SearchResult {
  slugEvent: string
  nom: string
  ville: string
  date: string
  prix: number
  image: string | null
}

interface PopularEvent {
  slugEvent: string
  nom: string
  ville: string
  image: string | null
}

const LANG_OPTIONS: Array<{ locale: Locale; flag: string; label: string; sub: string }> = [
  { locale: 'fr', flag: '🇫🇷', label: 'French', sub: 'France' },
  { locale: 'en', flag: '🇬🇧', label: 'English', sub: 'United Kingdom' },
]

const CURRENCY_OPTIONS: Array<{ currency: Currency; symbol: string; label: string; sub: string }> = [
  { currency: 'EUR', symbol: '€', label: 'Euro', sub: 'EUR' },
  { currency: 'USD', symbol: '$', label: 'US Dollar', sub: 'USD' },
]

export default function Header({ transparent = false }: HeaderProps) {
  const { t } = useTranslation('common')
  const { cart } = useCart()
  const router = useRouter()

  const searchWrapRef = useRef<HTMLDivElement>(null)

  const [mounted, setMounted] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [popularEvents, setPopularEvents] = useState<PopularEvent[]>([])
  const [popularLoaded, setPopularLoaded] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ModalTab>('lang')
  const [pendingLocale, setPendingLocale] = useState<Locale>('fr')
  const [pendingCurrency, setPendingCurrency] = useState<Currency>('EUR')
  const [activeCurrency, setActiveCurrency] = useState<Currency>('EUR')

  const currentLocale: Locale = router.locale === 'en' ? 'en' : 'fr'
  const cartCount = cart.reduce((sum, item) => sum + item.quantite, 0)

  // Mount — read localStorage
  useEffect(() => {
    setMounted(true)
    const savedCurrency = localStorage.getItem('zenntry_currency')
    if (savedCurrency === 'EUR' || savedCurrency === 'USD') {
      setActiveCurrency(savedCurrency)
      setPendingCurrency(savedCurrency)
    }
    try {
      const savedRecents = localStorage.getItem('zenntry_recent_searches')
      if (savedRecents) setRecentSearches(JSON.parse(savedRecents))
    } catch { /* ignore */ }
  }, [])

  // Scroll tracking for transparent header
  useEffect(() => {
    if (!transparent) return
    const handleScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [transparent])

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close search dropdown on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Fetch popular events when dropdown opens with no query
  useEffect(() => {
    if (!searchOpen || searchQuery.trim() || popularLoaded) return
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
        // Rank by recency (closest date to now)
        const entries = Array.from(groups.entries())
        const sortedByDate = [...entries].sort((a, b) => Math.abs(a[1].closestDate - now) - Math.abs(b[1].closestDate - now))
        const recencyMap = new Map<string, number>()
        sortedByDate.forEach(([slug], i) => recencyMap.set(slug, entries.length - i))
        // Score: qty_rank * 0.6 + recency_rank * 0.4
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
  }, [searchOpen, searchQuery, popularLoaded])

  // Live search with 200ms debounce — smart multi-field search
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const ql = q.toLowerCase()
        const { data } = await supabase
          .from('billets')
          .select('evenement, slug, date, ville, pays, categorie, prix, image')
          .or(`evenement.ilike.%${q}%,ville.ilike.%${q}%,pays.ilike.%${q}%,categorie.ilike.%${q}%`)
          .order('date', { ascending: true })
          .limit(40)
        if (data) {
          const seen = new Map<string, SearchResult & { priority: number }>()
          for (const r of data) {
            const slugEvent = r.slug as string
            if (seen.has(slugEvent)) continue
            const nom = (r.evenement as string) ?? ''
            const ville = (r.ville as string) ?? ''
            const pays = (r.pays as string) ?? ''
            const categorie = (r.categorie as string) ?? ''
            const nomL = nom.toLowerCase()
            // Priority: 1=starts with (highest), 2=contains, 3=city, 4=country, 5=venue(city), 6=category
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
              prix: parseFloat((r.prix as string) ?? '0'),
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
  }, [searchQuery])

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
  const navigateToResult = (result: SearchResult) => {
    saveRecent(searchQuery.trim() || result.nom)
    setSearchOpen(false); setSearchQuery('')
    router.push(`/${result.slugEvent}`)
  }
  const navigateFromRecent = (term: string) => {
    saveRecent(term); setSearchOpen(false)
    router.push(`/?q=${encodeURIComponent(term)}`)
  }
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    saveRecent(q); setSearchOpen(false)
    router.push(`/?q=${encodeURIComponent(q)}`)
  }

  const openModal = () => {
    setPendingLocale(currentLocale); setPendingCurrency(activeCurrency)
    setActiveTab('lang'); setModalOpen(true)
  }
  const applyModal = () => {
    if (pendingLocale !== currentLocale) {
      document.cookie = `NEXT_LOCALE=${pendingLocale}; path=/; max-age=31536000`
      router.push(router.asPath, router.asPath, { locale: pendingLocale })
    }
    localStorage.setItem('zenntry_currency', pendingCurrency)
    setActiveCurrency(pendingCurrency); setModalOpen(false)
  }

  const flagFor = (loc: Locale) => (loc === 'fr' ? '🇫🇷' : '🇬🇧')
  const selectorLabel = mounted ? `${flagFor(currentLocale)} ${activeCurrency}` : '🇫🇷 EUR'

  const fmtDate = (iso: string) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString(currentLocale === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric', month: 'short',
      })
    } catch { return '' }
  }
  const getInitial = (name: string) => name.charAt(0).toUpperCase()
  const showDropdown = searchOpen && mounted

  // Transparent mode: show white text/icons when not yet scrolled
  const isWhite = transparent && !scrolled

  // Whether to show the search bar (hidden in transparent un-scrolled state)
  const showSearch = !transparent || scrolled

  const textStyle = isWhite ? { color: 'white' } : undefined
  const cartStroke = isWhite ? 'white' : '#111111'

  return (
    <>
      <header className={`hdr${isWhite ? ' hdr--tp' : ''}`}>
        <div className="hdr__inner">

          {/* ── Left: Logo + Search + Nav ── */}
          <div className="hdr__left">

            {/* Logo */}
            <Link href="/" className="hdr__logo">
              <span className="hdr__wordmark" style={textStyle}>ZENNTRY</span>
            </Link>

            {/* Search — hidden in transparent un-scrolled state */}
            {showSearch && (
              <div className="hdr__search-wrap" ref={searchWrapRef}>
                <form className="hdr__search" onSubmit={handleSearchSubmit}>
                  <svg className="hdr__search-icon" width="15" height="15" viewBox="0 0 24 24"
                    fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Search artist or event..."
                    className="hdr__search-input"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </form>

                {showDropdown && (
                  <div className="hdr__dd">
                    {searchQuery.length === 0 ? (
                      <>
                        {/* Recent searches */}
                        {recentSearches.length > 0 && (
                          <div className="hdr__dd-section">
                            <div className="hdr__dd-head">
                              <span className="hdr__dd-label">Recent searches</span>
                              <button className="hdr__dd-clear" type="button" onClick={clearRecents}>Clear</button>
                            </div>
                            {recentSearches.map(term => (
                              <button key={term} type="button" className="hdr__dd-row"
                                onClick={() => navigateFromRecent(term)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                  stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                <span className="hdr__dd-row-text">{term}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Popular events */}
                        {popularEvents.length > 0 && (
                          <div className="hdr__dd-section">
                            <div className="hdr__dd-head">
                              <span className="hdr__dd-label">Popular events</span>
                            </div>
                            {popularEvents.map(ev => (
                              <button key={ev.slugEvent} type="button" className="hdr__dd-row"
                                onClick={() => { saveRecent(ev.nom); setSearchOpen(false); setSearchQuery(''); router.push(`/${ev.slugEvent}`) }}>
                                <span className="hdr__dd-thumb">
                                  {ev.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={`/images/events/${ev.image}`} alt="" className="hdr__dd-thumb-img" />
                                  ) : (
                                    <span className="hdr__dd-initial">{getInitial(ev.nom)}</span>
                                  )}
                                </span>
                                <span className="hdr__dd-info">
                                  <span className="hdr__dd-name">{ev.nom}</span>
                                  {ev.ville && <span className="hdr__dd-sub">{ev.ville}</span>}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : searching ? (
                      <div className="hdr__dd-empty">Searching…</div>
                    ) : searchResults.length > 0 ? (
                      <div className="hdr__dd-section">
                        <div className="hdr__dd-head">
                          <span className="hdr__dd-label">Events</span>
                        </div>
                        {searchResults.map(result => (
                          <button key={result.slugEvent} type="button" className="hdr__dd-row"
                            onClick={() => navigateToResult(result)}>
                            <span className="hdr__dd-thumb">
                              {result.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`/images/events/${result.image}`} alt="" className="hdr__dd-thumb-img" />
                              ) : (
                                <span className="hdr__dd-initial">{getInitial(result.nom)}</span>
                              )}
                            </span>
                            <span className="hdr__dd-info">
                              <span className="hdr__dd-name">{result.nom}</span>
                              <span className="hdr__dd-sub">
                                {result.ville}{result.ville && result.date ? ' · ' : ''}{fmtDate(result.date)}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="hdr__dd-empty">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }}>
                          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                        </svg>
                        Not in our current selection —{' '}
                        <Link href={`/request?event=${encodeURIComponent(searchQuery.trim())}`}
                          className="hdr__dd-request-link" onClick={() => setSearchOpen(false)}>
                          Request access →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nav links — always visible */}
            <nav className="hdr__nav">
              <Link href="/sports" className="hdr__nav-link" style={textStyle}>Sports</Link>
              <Link href="/concerts" className="hdr__nav-link" style={textStyle}>Music</Link>
            </nav>
          </div>

          {/* ── Right: Selector + Contact + Cart ── */}
          <div className="hdr__right">
            <button
              className="hdr__selector"
              onClick={openModal}
              aria-label="Language and currency"
              style={isWhite ? { color: 'white', borderColor: 'rgba(255,255,255,0.35)' } : undefined}
            >
              {selectorLabel}
            </button>

            <Link href="/contact" className="hdr__link" style={textStyle}>
              {mounted ? t('nav.contact') : 'Contact'}
            </Link>

            {/* Cart */}
            <div className="hdr__cart-wrap">
              <Link href="/panier" className="hdr__cart" aria-label="Cart">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke={cartStroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: 'stroke 0.2s' }}>
                  <path d="M4 8h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V8z" />
                  <path d="M9 8V6a3 3 0 016 0v2" />
                </svg>
              </Link>
              {mounted && cartCount > 0 && (
                <span className="hdr__badge">{cartCount}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Language + Currency Modal ── */}
      {modalOpen && (
        <div className="lcm-backdrop" onClick={() => setModalOpen(false)}>
          <div className="lcm" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="lcm__head">
              <div className="lcm__tabs">
                <button className={`lcm__tab${activeTab === 'lang' ? ' lcm__tab--on' : ''}`}
                  onClick={() => setActiveTab('lang')}>Language and Region</button>
                <button className={`lcm__tab${activeTab === 'currency' ? ' lcm__tab--on' : ''}`}
                  onClick={() => setActiveTab('currency')}>Currency</button>
              </div>
              <button className="lcm__close" onClick={() => setModalOpen(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="lcm__body">
              {activeTab === 'lang' ? (
                <div className="lcm__options">
                  {LANG_OPTIONS.map(opt => (
                    <button key={opt.locale}
                      className={`lcm__option${pendingLocale === opt.locale ? ' lcm__option--on' : ''}`}
                      onClick={() => setPendingLocale(opt.locale)}>
                      <span className="lcm__opt-icon">{opt.flag}</span>
                      <span className="lcm__opt-text">
                        <span className="lcm__opt-label">{opt.label}</span>
                        <span className="lcm__opt-sub">{opt.sub}</span>
                      </span>
                      {pendingLocale === opt.locale && (
                        <svg className="lcm__check" width="17" height="17" viewBox="0 0 24 24"
                          fill="none" stroke="#1a3a2a" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="lcm__options">
                  {CURRENCY_OPTIONS.map(opt => (
                    <button key={opt.currency}
                      className={`lcm__option${pendingCurrency === opt.currency ? ' lcm__option--on' : ''}`}
                      onClick={() => setPendingCurrency(opt.currency)}>
                      <span className="lcm__opt-symbol">{opt.symbol}</span>
                      <span className="lcm__opt-text">
                        <span className="lcm__opt-label">{opt.label}</span>
                        <span className="lcm__opt-sub">{opt.sub}</span>
                      </span>
                      {pendingCurrency === opt.currency && (
                        <svg className="lcm__check" width="17" height="17" viewBox="0 0 24 24"
                          fill="none" stroke="#1a3a2a" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="lcm__foot">
              <button className="lcm__apply" onClick={applyModal}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* @ts-ignore */}
      <style jsx>{`
        .hdr {
          background: white;
          border-bottom: 1px solid #E5E5E0;
          position: sticky;
          top: 0;
          z-index: 50;
          height: 64px;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .hdr--tp {
          background: transparent;
          border-bottom-color: transparent;
        }
        .hdr__inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 100%;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
        }
        .hdr__left {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 1rem;
          flex-shrink: 0;
        }
        /* Logo */
        .hdr__logo {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          flex-shrink: 0;
        }
        .hdr__wordmark {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: #1a3a2a;
          white-space: nowrap;
          line-height: 1;
          transition: color 0.2s;
        }
        /* Search */
        .hdr__search-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .hdr__search {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 999px;
          padding: 0 0.875rem;
          width: 340px;
          height: 38px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .hdr__search:focus-within {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }
        .hdr__search-icon { flex-shrink: 0; pointer-events: none; }
        .hdr__search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.875rem;
          font-family: 'Inter', system-ui, sans-serif;
          color: #111111;
          background: transparent;
          min-width: 0;
        }
        .hdr__search-input::placeholder { color: #9ca3af; }
        /* Dropdown */
        .hdr__dd {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          width: 100%;
          min-width: 480px;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
          z-index: 300;
          overflow-y: auto;
          max-height: 420px;
        }
        .hdr__dd-section + .hdr__dd-section { border-top: 1px solid #f0f0ee; }
        .hdr__dd-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px 6px;
        }
        .hdr__dd-label {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #999999;
        }
        .hdr__dd-clear {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 500;
          color: #9ca3af;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
        }
        .hdr__dd-clear:hover { color: #111111; }
        .hdr__dd-row {
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
          font-family: 'Inter', system-ui, sans-serif;
          transition: background 0.1s;
          text-align: left;
          color: #111111;
        }
        .hdr__dd-row:hover { background: #f7f7f5; }
        .hdr__dd-row-text {
          font-size: 14px;
          color: #111111;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .hdr__dd-thumb {
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
        .hdr__dd-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .hdr__dd-initial {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 14px;
          font-weight: 600;
          color: white;
          line-height: 1;
        }
        .hdr__dd-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
          text-align: left;
        }
        .hdr__dd-name {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #111111;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hdr__dd-sub {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 12px;
          color: #999999;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hdr__dd-empty {
          padding: 16px;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #9ca3af;
        }
        .hdr__dd-request-link {
          color: #1a3a2a;
          font-weight: 500;
          text-decoration: none;
        }
        .hdr__dd-request-link:hover { text-decoration: underline; }
        /* Nav */
        .hdr__nav {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 1.5rem;
          margin-left: 8px;
          flex-shrink: 0;
        }
        .hdr__nav-link {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9375rem;
          color: #111111;
          text-decoration: none;
          transition: color 0.15s;
          white-space: nowrap;
        }
        .hdr__nav-link:hover { color: #1a3a2a; }
        /* Right */
        .hdr__right {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 1.25rem;
          flex-shrink: 0;
        }
        .hdr__selector {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #111111;
          background: none;
          border: 1px solid #E5E5E0;
          border-radius: 6px;
          padding: 0.375rem 0.75rem;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s, color 0.2s;
          height: 34px;
        }
        .hdr__selector:hover { border-color: #9ca3af; }
        .hdr__link {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9375rem;
          color: #111111;
          text-decoration: none;
          transition: color 0.2s;
          white-space: nowrap;
        }
        .hdr__link:hover { color: #1a3a2a; }
        /* Cart */
        .hdr__cart-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 22px;
          height: 22px;
        }
        .hdr__cart {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #111111;
          text-decoration: none;
          line-height: 0;
        }
        .hdr__badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #1a3a2a;
          color: white;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 10px;
          font-weight: 600;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          pointer-events: none;
        }
        /* Responsive */
        @media (max-width: 768px) {
          .hdr__search-wrap { display: none; }
          .hdr__nav { display: none; }
          .hdr__inner { gap: 0.75rem; }
          .hdr__right { gap: 1rem; }
        }
      `}</style>

      {/* @ts-ignore */}
      <style jsx global>{`
        .lcm-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .lcm {
          background: white;
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .lcm__head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          padding: 1.25rem 1.5rem 0;
          border-bottom: 1px solid #E5E5E0;
        }
        .lcm__tabs { display: flex; gap: 0; }
        .lcm__tab {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          color: #9ca3af;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 0 0 0.875rem;
          margin-right: 1.5rem;
          cursor: pointer;
          transition: color 0.15s;
          white-space: nowrap;
        }
        .lcm__tab--on { color: #111111; border-bottom-color: #111111; }
        .lcm__close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          border-radius: 6px;
          margin-bottom: 0.75rem;
          transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .lcm__close:hover { background: #f3f4f6; color: #111111; }
        .lcm__body { padding: 1.25rem 1.5rem; }
        .lcm__options { display: flex; flex-direction: column; gap: 0.625rem; }
        .lcm__option {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.125rem;
          border: 1.5px solid #E5E5E0;
          border-radius: 10px;
          background: white;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: border-color 0.15s, background 0.15s;
        }
        .lcm__option:hover { border-color: #c4c4bc; }
        .lcm__option--on { border-color: #1a3a2a; background: #f6faf7; }
        .lcm__opt-icon { font-size: 1.625rem; flex-shrink: 0; line-height: 1; }
        .lcm__opt-symbol {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 1.625rem;
          font-weight: 600;
          color: #1a3a2a;
          flex-shrink: 0;
          width: 2rem;
          text-align: center;
          line-height: 1;
        }
        .lcm__opt-text { flex: 1; display: flex; flex-direction: column; gap: 0.125rem; text-align: left; }
        .lcm__opt-label {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9375rem;
          font-weight: 500;
          color: #111111;
        }
        .lcm__opt-sub {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #9ca3af;
        }
        .lcm__check { flex-shrink: 0; margin-left: auto; }
        .lcm__foot { padding: 0.75rem 1.5rem 1.5rem; }
        .lcm__apply {
          width: 100%;
          background: #111111;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 0.875rem;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .lcm__apply:hover { background: #2a2a2a; }
      `}</style>
    </>
  )
}
