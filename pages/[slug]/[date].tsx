// pages/[slug]/[date].tsx
import { GetStaticPaths, GetStaticProps } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/supabaseClient'
import { useCart } from '@/context/cartContext'
import { ShoppingCart, MapPin } from 'lucide-react'

type Billet = {
  id_billet: string
  categorie: string
  quantite: number
  prix: number
  disponible: boolean
  evenement: string
  ville: string
  pays: string
  lieu: string | null
  map_png: string
  map_svg: string
  zone_id: string
  logo_artiste?: string
  quantite_adult?: number | null
  quantite_child?: number | null
  prix_adult?: number | null
  prix_child?: number | null
  extra_info?: string | null
}

type TypeABillet = Billet & { _type: 'A'; _groupQuantite: number }
type TypeBBillet = Billet & { _type: 'B' }
type ListingItem = TypeABillet | TypeBBillet

function buildListings(billets: Billet[]): ListingItem[] {
  const items: ListingItem[] = []

  // TYPE B — adult+child listings (quantite_adult > 0): one card per row
  const typeB = billets.filter(b => (b.quantite_adult ?? 0) > 0)
  for (const b of typeB) {
    items.push({ ...b, _type: 'B' })
  }

  // TYPE A — adult-only (quantite_adult is null or 0): group by (categorie, prix)
  const typeA = billets.filter(b => !(b.quantite_adult != null && b.quantite_adult > 0))
  const map = new Map<string, { rep: Billet; total: number }>()
  for (const b of typeA) {
    const key = `${b.categorie}|${b.prix}`
    const existing = map.get(key)
    if (existing) {
      existing.total += b.quantite
    } else {
      map.set(key, { rep: b, total: b.quantite })
    }
  }
  for (const { rep, total } of map.values()) {
    items.push({ ...rep, _type: 'A', _groupQuantite: total })
  }

  return items
}

type EventItem = {
  nom: string
  slugEvent: string
  logo: string
  dates: string[]
}

interface PageProps {
  billets: Billet[]
  evenementName: string
  locationLabel: string
  venue: string | null
  city: string
  pngSrc: string | null
  svgSrc: string | null
  stockPerZone: Record<string, number>
  logoArtiste: string
  eventImage: string | null
  events: EventItem[]
  allSoldOut: boolean
  slug: string
}

const extraireCategorie = (text: string) => {
  if (text.toLowerCase().includes('carré or')) return 'Carré Or'
  if (text.toLowerCase().includes('fosse')) return 'Fosse'
  if (text.toLowerCase().includes('pelouse')) return 'Pelouse'
  const match = text.match(/Catégorie\s\d/)
  return match ? match[0] : text
}

const ordreCategories = [
  'Catégorie 3',
  'Catégorie 2',
  'Catégorie 1',
  'Carré Or',
  'Pelouse',
  'Fosse',
]

const isMixed = (b: Billet) =>
  b.quantite_adult != null && b.quantite_child != null &&
  b.prix_adult != null && b.prix_child != null

const getQuantitesValides = (billet: Billet) => {
  const cat = extraireCategorie(billet.categorie).toLowerCase()
  if (['fosse', 'pelouse', 'pelouse or'].includes(cat)) {
    return Array.from({ length: billet.quantite }, (_, i) => i + 1)
  }
  const q = billet.quantite
  return Array.from({ length: q }, (_, i) => i + 1).filter(n => q - n !== 1)
}

type SortMode = 'best_value' | 'lowest_price' | 'best_seats'

function sortBillets(billets: Billet[], mode: SortMode): Billet[] {
  const arr = [...billets]
  switch (mode) {
    case 'lowest_price':
      return arr.sort((a, b) => {
        const pa = isMixed(a) ? (a.prix_adult ?? 0) : a.prix
        const pb = isMixed(b) ? (b.prix_adult ?? 0) : b.prix
        return pa - pb
      })
    case 'best_seats':
      return arr.sort((a, b) => {
        const ia = ordreCategories.indexOf(extraireCategorie(a.categorie))
        const ib = ordreCategories.indexOf(extraireCategorie(b.categorie))
        if (ia !== ib) return ib - ia // higher index = "better" category
        const pa = isMixed(a) ? (a.prix_adult ?? 0) : a.prix
        const pb = isMixed(b) ? (b.prix_adult ?? 0) : b.prix
        return pa - pb
      })
    case 'best_value':
    default:
      // cheapest per category group, then by price
      return arr.sort((a, b) => {
        const pa = isMixed(a) ? (a.prix_adult ?? 0) : a.prix
        const pb = isMixed(b) ? (b.prix_adult ?? 0) : b.prix
        return pa - pb
      })
  }
}

function getCheapestId(billets: ListingItem[]): string | null {
  if (billets.length === 0) return null
  let cheapest = billets[0]
  let cheapestPrice = isMixed(cheapest) ? (cheapest.prix_adult ?? 0) : cheapest.prix
  for (const b of billets) {
    const p = isMixed(b) ? (b.prix_adult ?? 0) : b.prix
    if (p < cheapestPrice) {
      cheapest = b
      cheapestPrice = p
    }
  }
  return cheapest.id_billet
}

// i18n helpers
const t = (locale: string, fr: string, en: string) => locale === 'fr' ? fr : en

export default function EventDatePage({
  billets,
  evenementName,
  locationLabel,
  venue,
  city,
  pngSrc,
  svgSrc,
  stockPerZone,
  logoArtiste,
  eventImage,
  events,
  allSoldOut,
  slug: slugProp,
}: PageProps) {
  const router = useRouter()
  const locale = router.locale ?? 'fr'
  const { cart, addToCart } = useCart()
  const { slug: slugQuery, date } = router.query as { slug: string; date: string }
  const slug = slugProp || slugQuery

  // --- State ---
  const [search, setSearch] = useState('')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreQuantite, setFiltreQuantite] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('best_value')
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [selectedAdult, setSelectedAdult] = useState<Record<string, number>>({})
  const [selectedChild, setSelectedChild] = useState<Record<string, number>>({})
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistMsg, setWaitlistMsg] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [showMobileMap, setShowMobileMap] = useState(false)

  // --- Search dropdown ---
  const [showDropdown, setShowDropdown] = useState(false)
  const [eventsList, setEventsList] = useState<EventItem[]>([])
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchMenu = async () => {
      const { data, error } = await supabase
        .from('billets')
        .select('evenement, slug, date, logo_artiste')
        .order('date', { ascending: true })
      if (!error && data) {
        const map = new Map<string, EventItem>()
        ;(data as Array<{ evenement: string; slug: string; date: string; logo_artiste?: string }>).forEach(r => {
          if (!map.has(r.evenement)) {
            map.set(r.evenement, { nom: r.evenement, slugEvent: r.slug, logo: r.logo_artiste ?? '', dates: [] })
          }
          const ev = map.get(r.evenement)!
          if (r.date && !ev.dates.includes(r.date)) ev.dates.push(r.date)
        })
        const arr = Array.from(map.values())
        arr.sort((a, b) => new Date(a.dates[0]).getTime() - new Date(b.dates[0]).getTime())
        setEventsList(arr)
      }
    }
    fetchMenu()
  }, [])

  const candidates = useMemo(() => {
    const base = search.trim() === ''
      ? eventsList
      : eventsList.filter(ev => ev.nom.toLowerCase().includes(search.toLowerCase()))
    return base.slice(0, 8)
  }, [search, eventsList])

  // --- Waitlist ---
  const handleWaitlist = async () => {
    if (!waitlistEmail) return
    setWaitlistLoading(true)
    try {
      const res = await fetch('/api/waitlist/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: waitlistEmail }),
      })
      const data = await res.json()
      setWaitlistMsg(data.message || 'Subscribed!')
      setWaitlistEmail('')
    } catch {
      setWaitlistMsg('Something went wrong. Please try again.')
    }
    setWaitlistLoading(false)
  }

  // --- Quantity init ---
  useEffect(() => {
    const init: Record<string, number> = {}
    const initAdult: Record<string, number> = {}
    const initChild: Record<string, number> = {}
    billets.forEach(b => {
      if (isMixed(b)) {
        initAdult[b.id_billet] = 1
        initChild[b.id_billet] = 0
      } else {
        init[b.id_billet] = 1
      }
    })
    setSelectedQuantities(init)
    setSelectedAdult(initAdult)
    setSelectedChild(initChild)
  }, [billets])

  // --- Filtering + sorting + grouping ---
  const filteredBillets = useMemo(() => {
    let result = billets
    if (selectedZone) result = result.filter(b => b.zone_id === selectedZone)
    if (filtreCategorie) result = result.filter(b => extraireCategorie(b.categorie) === filtreCategorie)
    if (filtreQuantite) {
      const q = Number(filtreQuantite)
      result = result.filter(b => getQuantitesValides(b).includes(q))
    }
    const sorted = sortBillets(result, sortMode)
    return buildListings(sorted)
  }, [billets, selectedZone, filtreCategorie, filtreQuantite, sortMode])

  const categoriesDisponibles = Array.from(
    new Set(billets.map(b => extraireCategorie(b.categorie)))
  ).sort((a, b) => ordreCategories.indexOf(a) - ordreCategories.indexOf(b))
  const quantiteMax = Math.max(...billets.map(b => b.quantite), 1)
  const cheapestId = getCheapestId(filteredBillets)

  const handleZoneSelect = (zoneId: string) => {
    setSelectedZone(prev => (prev === zoneId ? null : zoneId))
  }

  // --- Date formatting ---
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    } catch { return iso }
  }

  // --- Confirmation flash ---
  const flash = (msg: string, ms = 4000) => {
    setConfirmationMessage(msg)
    setTimeout(() => setConfirmationMessage(''), ms)
  }

  // --- Buy handler (standard) ---
  const handleBuy = (billet: Billet) => {
    const mixed = isMixed(billet)
    if (mixed) {
      const adultQty = selectedAdult[billet.id_billet] ?? 1
      const childQty = selectedChild[billet.id_billet] ?? 0
      if (adultQty === 0 && childQty === 0) { flash(t(locale, 'Sélectionnez au moins 1 billet.', 'Select at least 1 ticket.'), 3000); return }
      if (adultQty === 0 && childQty > 0) { flash(t(locale, 'Au moins 1 adulte est requis pour accompagner les enfants.', 'At least 1 adult is required to accompany children.'), 4000); return }
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ billet_id: billet.id_billet, quantity: adultQty + childQty, adult_qty: adultQty, child_qty: childQty }] }),
      })
        .then(r => r.json())
        .then(data => { if (data.url) window.location.href = data.url; else throw new Error() })
        .catch(() => flash(t(locale, 'Impossible de lancer le paiement.', 'Unable to start payment.')))
    } else {
      const qty = selectedQuantities[billet.id_billet] || 1
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ billet_id: billet.id_billet, quantity: qty }] }),
      })
        .then(r => r.json())
        .then(data => { if (data.url) window.location.href = data.url; else throw new Error() })
        .catch(() => flash(t(locale, 'Impossible de lancer le paiement.', 'Unable to start payment.')))
    }
  }

  // --- Add to cart handler ---
  const handleAddToCart = (billet: Billet) => {
    const mixed = isMixed(billet)
    if (mixed) {
      const adultQty = selectedAdult[billet.id_billet] ?? 1
      const childQty = selectedChild[billet.id_billet] ?? 0
      if (adultQty === 0 && childQty === 0) { flash(t(locale, 'Sélectionnez au moins 1 billet.', 'Select at least 1 ticket.'), 3000); return }
      if (adultQty === 0 && childQty > 0) { flash(t(locale, 'Au moins 1 adulte est requis pour accompagner les enfants.', 'At least 1 adult is required to accompany children.'), 4000); return }
      addToCart({ ...billet, quantite: adultQty + childQty, adult_qty: adultQty, child_qty: childQty } as any, adultQty + childQty)
      flash(`${adultQty + childQty} ${t(locale, 'billet(s) ajouté(s) au panier', 'ticket(s) added to cart')}`)
    } else {
      const qty = selectedQuantities[billet.id_billet] || 1
      const existing = cart.find(i => i.id_billet === billet.id_billet)
      const already = existing ? existing.quantite : 0

      // enforce_no_solo: don't leave exactly 1 remaining
      const remainingAfter = billet.quantite - (already + qty)
      if (remainingAfter === 1) {
        flash(t(locale,
          'Merci de sélectionner au minimum 2 places afin de ne pas laisser une seule place disponible.',
          'Please select at least 2 tickets to avoid leaving a single ticket remaining.'), 5500)
        return
      }
      if (already + qty > billet.quantite) {
        const maxAdd = billet.quantite - already
        flash(t(locale,
          `Impossible d'ajouter ${qty} billet${qty > 1 ? 's' : ''} : vous avez déjà ${already} billet${already > 1 ? 's' : ''} et il ne reste que ${maxAdd} place${maxAdd > 1 ? 's' : ''}.`,
          `Cannot add ${qty} ticket${qty > 1 ? 's' : ''}: you already have ${already} and only ${maxAdd} remain${maxAdd > 1 ? '' : 's'}.`))
        return
      }
      addToCart(billet, qty)
      flash(`${qty} ${t(locale, `billet${qty > 1 ? 's' : ''} ajouté${qty > 1 ? 's' : ''} au panier`, `ticket${qty > 1 ? 's' : ''} added to cart`)}`)
    }
  }

  // --- Ticket count for cart icon ---
  const ticketCount = cart.reduce((sum, item) => sum + (item.quantite || 0), 0)

  const hasMap = !!(pngSrc || svgSrc)
  const venueLabel = venue ? `${venue}, ${city}` : locationLabel

  // ============================================
  // RENDER
  // ============================================

  const renderInfoIcon = (extraInfo: string | null | undefined) => {
    if (!extraInfo) return null
    return (
      <span className="group relative ml-1 cursor-help">
        <span className="text-[#AAAAAA] text-[12px]">ⓘ</span>
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-[#333] text-white text-[11px] rounded px-2 py-1 whitespace-nowrap z-50">
          {extraInfo}
        </span>
      </span>
    )
  }

  const renderListingCard = (item: ListingItem) => {
    const catName = extraireCategorie(item.categorie)
    const isCheapest = item.id_billet === cheapestId

    if (item._type === 'A') {
      // TYPE A — adult-only, single row card
      const epuise = item._groupQuantite === 0
      return (
        <div
          key={item.id_billet}
          className="bg-white rounded-xl px-5 flex items-center justify-between transition-all hover:border-[#1a3a2a] hover:shadow-sm"
          style={{ height: 64, border: '1px solid #E5E5E0', fontFamily: "'Inter', sans-serif" }}
        >
          {/* LEFT */}
          <div className="flex items-center">
            <span className="text-[15px] font-medium text-[#111]">
              {catName}
            </span>
            {renderInfoIcon(item.extra_info)}
          </div>

          {epuise ? (
            <span className="text-sm font-semibold text-red-500">{t(locale, 'Épuisé', 'Sold out')}</span>
          ) : (
            <>
              {/* MIDDLE — price */}
              <div className="flex-1 text-right pr-6">
                <span className="text-[24px] font-bold text-[#1a3a2a]">{item.prix} €</span>
                <p className="text-[11px] text-[#999]">/ ticket · {t(locale, 'tout compris', 'all fees included')}</p>
              </div>

              {/* RIGHT — pill + qty + buy */}
              <div className="flex items-center gap-2">
                {isCheapest && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#1a3a2a] bg-[#f0f7f3] text-[#1a3a2a] whitespace-nowrap">
                    {t(locale, 'Meilleur prix', 'Best price')}
                  </span>
                )}
                <select
                  value={selectedQuantities[item.id_billet]}
                  onChange={e => setSelectedQuantities(prev => ({ ...prev, [item.id_billet]: Number(e.target.value) }))}
                  className="h-9 w-16 bg-white text-[#111] border border-[#E5E5E0] rounded-lg text-[13px] text-center"
                >
                  {getQuantitesValides(item).map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleBuy(item)}
                  className="bg-[#1a3a2a] text-white text-[13px] font-medium rounded-lg px-5 h-9 hover:bg-[#0f2419] transition"
                >
                  {t(locale, 'Acheter', 'Buy')}
                </button>
              </div>
            </>
          )}
        </div>
      )
    }

    // TYPE B — adult+child, two-part card
    const adultQty = selectedAdult[item.id_billet] ?? 1
    const childQty = selectedChild[item.id_billet] ?? 0
    const totalStock = (item.quantite_adult ?? 0) + (item.quantite_child ?? 0)
    const epuise = totalStock === 0
    const total = adultQty * (item.prix_adult ?? 0) + childQty * (item.prix_child ?? 0)

    return (
      <div
        key={item.id_billet}
        className="bg-white rounded-xl overflow-hidden transition-all hover:border-[#1a3a2a] hover:shadow-sm"
        style={{ border: '1px solid #E5E5E0', fontFamily: "'Inter', sans-serif" }}
      >
        {/* Top row */}
        <div className="px-5 flex items-center justify-between" style={{ height: 64 }}>
          {/* LEFT */}
          <div className="flex items-center">
            <span className="text-[15px] font-medium text-[#111]">
              {catName}
            </span>
            {renderInfoIcon(item.extra_info)}
          </div>

          {epuise ? (
            <span className="text-sm font-semibold text-red-500">{t(locale, 'Épuisé', 'Sold out')}</span>
          ) : (
            <>
              <div className="flex-1 text-right pr-6">
                <span className="text-[24px] font-bold text-[#1a3a2a]">{item.prix_adult} €</span>
                <p className="text-[11px] text-[#999]">/ ticket · {t(locale, 'tout compris', 'all fees included')}</p>
              </div>
              {isCheapest && (
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#1a3a2a] bg-[#f0f7f3] text-[#1a3a2a] whitespace-nowrap">
                  {t(locale, 'Meilleur prix', 'Best price')}
                </span>
              )}
            </>
          )}
        </div>

        {/* Expanded section */}
        {!epuise && (
          <div className="bg-[#FAFAF8] border-t border-[#E5E5E0] px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                {/* Adults row */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#888]">{t(locale, 'Adultes', 'Adults')}</span>
                  <select
                    value={adultQty}
                    onChange={e => setSelectedAdult(prev => ({ ...prev, [item.id_billet]: Number(e.target.value) }))}
                    className="h-9 w-16 bg-white text-[#111] border border-[#E5E5E0] rounded-lg text-[13px] text-center"
                  >
                    {Array.from({ length: (item.quantite_adult ?? 0) + 1 }, (_, i) => i).map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[#888]">× {item.prix_adult} €</span>
                </div>
                {/* Children row */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#888]">{t(locale, 'Enfants', 'Children')}</span>
                  <select
                    value={childQty}
                    onChange={e => setSelectedChild(prev => ({ ...prev, [item.id_billet]: Number(e.target.value) }))}
                    className="h-9 w-16 bg-white text-[#111] border border-[#E5E5E0] rounded-lg text-[13px] text-center"
                  >
                    {Array.from({ length: (item.quantite_child ?? 0) + 1 }, (_, i) => i).map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[#888]">× {item.prix_child} €</span>
                </div>
              </div>

              {/* Total + Buy */}
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-medium text-[#111]">
                  Total: {total.toFixed(2)} €
                </span>
                <button
                  onClick={() => handleBuy(item)}
                  className="bg-[#1a3a2a] text-white text-[13px] font-medium rounded-lg px-5 h-9 hover:bg-[#0f2419] transition"
                >
                  {t(locale, 'Acheter', 'Buy')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- Waitlist block ---
  const renderWaitlist = () => (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <span className="inline-block bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded mb-4">
        Sold Out
      </span>
      <p className="text-[#888888] mb-6 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
        {t(locale, 'Tous les billets pour cette date sont épuisés.', 'All tickets for this date are currently sold out.')}
      </p>
      {waitlistMsg ? (
        <p className="text-green-600 text-sm">{waitlistMsg}</p>
      ) : (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="email"
            placeholder="your@email.com"
            value={waitlistEmail}
            onChange={e => setWaitlistEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleWaitlist()}
            className="text-sm px-3 py-2 border border-[#E5E5E0] rounded-md outline-none focus:border-[#1a3a2a]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          />
          <button
            onClick={handleWaitlist}
            disabled={waitlistLoading || !waitlistEmail}
            className="bg-[#1a3a2a] text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-[#15302a] disabled:opacity-50"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {waitlistLoading
              ? t(locale, 'Inscription…', 'Subscribing…')
              : t(locale, 'Me notifier quand disponible', 'Notify me when available')}
          </button>
        </div>
      )}
    </div>
  )

  // --- Empty filter state ---
  const renderEmptyFiltered = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-[#888888] text-sm mb-3" style={{ fontFamily: "'Inter', sans-serif" }}>
        {t(locale, 'Aucun billet pour ces critères', 'No tickets for these filters')}
      </p>
      <button
        onClick={() => { setFiltreCategorie(''); setFiltreQuantite(''); setSelectedZone(null) }}
        className="text-[#1a3a2a] text-sm font-medium hover:underline"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {t(locale, 'Réinitialiser', 'Reset')}
      </button>
    </div>
  )

  // --- Map panel ---
  const renderMapPanel = (className?: string) => (
    <div className={`bg-[#F7F7F4] rounded-2xl border border-[#E5E5E0] flex items-center justify-center overflow-hidden ${className ?? ''}`}>
      {hasMap ? (
        <img
          src={pngSrc || svgSrc || ''}
          alt={t(locale, 'Plan de salle', 'Seating map')}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-2" style={{ fontFamily: "'Inter', sans-serif" }}>
          <MapPin className="w-10 h-10 text-[#CCCCCC]" />
          <p className="text-[14px] font-medium text-[#AAAAAA]">
            {t(locale, 'Plan de salle', 'Seating map')}
          </p>
          <p className="text-[12px] text-[#CCCCCC]">
            {t(locale, 'Bientôt disponible', 'Coming soon')}
          </p>
        </div>
      )}
    </div>
  )

  // =============================================
  // HEADER (shared desktop/mobile)
  // =============================================
  const renderHeader = () => (
    <header
      className="w-full border-b border-[#E5E5E0] bg-[#FAFAF8] px-4 md:px-6"
      style={{ height: 72 }}
    >
      <div className="flex items-center justify-between h-full max-w-[1800px] mx-auto">
        {/* Left: image + event info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Event image */}
          <div className="relative w-11 h-11 flex-shrink-0 rounded-full overflow-hidden border border-[#E5E5E0]">
            <Image
              src={eventImage || `/images/artistes/${logoArtiste}`}
              alt={evenementName}
              layout="fill"
              objectFit="cover"
            />
          </div>
          <div className="min-w-0">
            <h1
              className="text-lg md:text-[22px] font-bold text-[#111111] truncate"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {evenementName}
            </h1>
            <p className="text-[13px] text-[#888888] truncate" style={{ fontFamily: "'Inter', sans-serif" }}>
              {formatDate(date as string)}
              <span className="mx-1.5">·</span>
              <MapPin className="w-3 h-3 inline -mt-0.5 mr-0.5" />
              {venueLabel}
            </p>
          </div>
        </div>

        {/* Right: search + cart */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {/* Cart */}
          <div className="relative cursor-pointer" onClick={() => router.push('/panier')}>
            <ShoppingCart className="w-5 h-5 text-[#111111]" />
            {ticketCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#1a3a2a] text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
                {ticketCount}
              </span>
            )}
          </div>

          {/* Search */}
          <div ref={searchRef} className="relative hidden md:block">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={t(locale, 'Rechercher un événement…', 'Search events…')}
              className="w-56 lg:w-64 px-3 py-2 rounded-md bg-white text-[#111111] placeholder-[#888888] border border-[#E5E5E0] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] focus:border-transparent"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
            {showDropdown && (
              <ul className="absolute z-50 mt-1 w-full bg-white border border-[#E5E5E0] rounded-md shadow-lg max-h-60 overflow-auto">
                {candidates.length > 0 ? candidates.map(ev => {
                  const href = ev.dates.length > 1 ? `/${ev.slugEvent}` : `/${ev.slugEvent}/${ev.dates[0]}`
                  return (
                    <li
                      key={ev.slugEvent}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-[13px]"
                      onMouseDown={() => router.push(href)}
                    >
                      {ev.logo && (
                        <Image
                          src={`/images/artistes/${ev.logo}`}
                          alt={ev.nom}
                          width={24}
                          height={24}
                          className="rounded-full object-cover"
                        />
                      )}
                      <span className="text-[#111111]">{ev.nom}</span>
                    </li>
                  )
                }) : (
                  <li className="px-3 py-2 text-[#888888] text-[13px]">{t(locale, 'Aucun résultat', 'No results')}</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </header>
  )

  // =============================================
  // FILTER BAR
  // =============================================
  const renderFilterBar = () => (
    <div className="sticky top-0 z-10 bg-[#FAFAF8] py-3 px-4">
      <div className="flex items-center gap-3">
        {/* Quantity dropdown */}
        <select
          value={filtreQuantite}
          onChange={e => setFiltreQuantite(e.target.value)}
          className="h-9 bg-white text-[#111111] border border-[#E5E5E0] px-3 rounded-md text-[13px]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <option value="">{t(locale, 'Quantité', 'Quantity')}</option>
          {Array.from({ length: quantiteMax }, (_, i) => i + 1).map(q => (
            <option key={q} value={q}>{q} {t(locale, `billet${q > 1 ? 's' : ''}`, `ticket${q > 1 ? 's' : ''}`)}</option>
          ))}
        </select>

        {/* Category dropdown */}
        <select
          value={filtreCategorie}
          onChange={e => setFiltreCategorie(e.target.value)}
          className="h-9 bg-white text-[#111111] border border-[#E5E5E0] px-3 rounded-md text-[13px]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <option value="">{t(locale, 'Toutes catégories', 'All categories')}</option>
          {categoriesDisponibles.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Sort dropdown */}
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
          className="h-9 bg-white text-[#111111] border border-[#E5E5E0] px-3 rounded-md text-[13px]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <option value="best_value">{t(locale, 'Meilleure valeur', 'Best value')}</option>
          <option value="lowest_price">{t(locale, 'Prix croissant', 'Lowest price')}</option>
          <option value="best_seats">{t(locale, 'Meilleures places', 'Best seats')}</option>
        </select>
      </div>

      {/* Ticket count */}
      <p className="text-[12px] text-[#999] mt-2 text-left" style={{ fontFamily: "'Inter', sans-serif" }}>
        {filteredBillets.length} {t(locale, 'billets disponibles', 'tickets available')}
      </p>

      {/* Divider */}
      <div className="border-b border-[#E5E5E0] mt-3" />
    </div>
  )

  // =============================================
  // DESKTOP
  // =============================================
  const renderDesktop = () => (
    <div className="hidden md:flex flex-col h-screen bg-[#FAFAF8]">
      {renderHeader()}

      {/* Confirmation banner */}
      {confirmationMessage && (
        <div className="bg-[#1a3a2a] text-white text-center py-2 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
          {confirmationMessage}
        </div>
      )}

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0">
        {/* Left column — 48% — listings */}
        <div className="flex flex-col" style={{ width: '48%' }}>
          {!allSoldOut && renderFilterBar()}

          <div className="flex-1 overflow-y-auto px-4 pt-3">
            {allSoldOut ? renderWaitlist() : (
              filteredBillets.length === 0 ? renderEmptyFiltered() : (
                <div className="flex flex-col gap-2">
                  {filteredBillets.map(b => renderListingCard(b))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right column — 52% — map */}
        <div className="p-3 sticky top-0 self-start" style={{ width: '52%', height: 'calc(100vh - 72px)' }}>
          {renderMapPanel('w-full h-full')}
        </div>
      </div>
    </div>
  )

  // =============================================
  // MOBILE
  // =============================================
  const renderMobile = () => {
    return (
      <div className="md:hidden flex flex-col min-h-screen bg-[#FAFAF8]">
        {renderHeader()}

        {/* Confirmation banner */}
        {confirmationMessage && (
          <div className="bg-[#1a3a2a] text-white text-center py-2 text-sm">
            {confirmationMessage}
          </div>
        )}

        {/* Map toggle */}
        {hasMap && (
          <div className="border-b border-[#E5E5E0]">
            <button
              onClick={() => setShowMobileMap(prev => !prev)}
              className="w-full py-2.5 text-[13px] text-[#1a3a2a] font-medium text-center"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {showMobileMap
                ? t(locale, 'Masquer la carte', 'Hide map')
                : t(locale, 'Voir la carte', 'View map')}
            </button>
            {showMobileMap && (
              <div className="px-3 pb-3">
                <div style={{ maxHeight: '200px', overflow: 'hidden' }} className="rounded-lg">
                  {renderMapPanel('w-full')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        {!allSoldOut && renderFilterBar()}

        {/* Listings */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
          {allSoldOut ? renderWaitlist() : (
            filteredBillets.length === 0 ? renderEmptyFiltered() : (
              <div className="flex flex-col gap-2">
                {filteredBillets.map(b => renderListingCard(b))}
              </div>
            )
          )}
        </div>

      </div>
    )
  }

  return (
    <>
      {renderDesktop()}
      {renderMobile()}
    </>
  )
}

// --- static paths & props ---
export const getStaticPaths: GetStaticPaths = async () => {
  const { data: dateRows } = await supabase
    .from('billets')
    .select('slug, date')
    .eq('disponible', true)

  const uniq = new Set<string>()
  ;(dateRows || []).forEach(b => {
    if (b.slug && b.date) uniq.add(`${b.slug}___${b.date}`)
  })

  return {
    paths: Array.from(uniq).map(str => {
      const [slug, date] = str.split('___')
      return { params: { slug, date } }
    }),
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  const slug = params!.slug as string
  const dateParam = params!.date as string

  // Check paused/archived + fetch image
  const { data: metaCheck } = await supabase
    .from('event_meta')
    .select('paused, archived, image')
    .eq('slug', slug)
    .single()

  if (metaCheck?.paused || metaCheck?.archived) {
    return { notFound: true }
  }

  // Fetch ALL billets for this slug+date (including sold out) to determine allSoldOut
  const { data: allBillets } = await supabase
    .from('billets')
    .select('*, logo_artiste, quantite_adult, quantite_child, prix_adult, prix_child, extra_info, lieu')
    .eq('slug', slug)
    .eq('date', dateParam)

  if (!allBillets || allBillets.length === 0) {
    return { notFound: true }
  }

  const allSoldOut = allBillets.every(b => !b.disponible || b.quantite === 0)

  // Filter to available billets for display
  const billets = (allSoldOut ? allBillets : allBillets.filter(b => b.disponible)) as Billet[]

  if (!allSoldOut && billets.length === 0) {
    return { notFound: true }
  }

  // on calcule les stocks par zone
  const stockPerZone = billets.reduce((acc, b) => {
    acc[b.zone_id] = (acc[b.zone_id] || 0) + b.quantite
    return acc
  }, {} as Record<string, number>)

  // on construit la liste unique des events pour la search-dropdown
  const { data: all } = await supabase
    .from('billets')
    .select('evenement, slug, logo_artiste, date')
    .eq('disponible', true)

  const eventsMap = new Map<string, EventItem>()
  ;(all || []).forEach(r => {
    const name = r.evenement
    const slugEvent = r.slug as string
    const logo = r.logo_artiste || ''
    const date = r.date
    if (!eventsMap.has(name)) {
      eventsMap.set(name, { nom: name, slugEvent, logo, dates: [] })
    }
    const ev = eventsMap.get(name)!
    if (date && !ev.dates.includes(date)) {
      ev.dates.push(date)
    }
  })
  const events = Array.from(eventsMap.values())

  const first = billets[0]
  return {
    props: {
      billets,
      evenementName: first.evenement,
      locationLabel: `${first.ville} – ${first.pays}`,
      venue: first.lieu ?? null,
      city: first.ville,
      pngSrc: first.map_png ? `/images/maps/${first.map_png}` : null,
      svgSrc: first.map_svg ? `/images/maps/${first.map_svg}` : null,
      stockPerZone,
      logoArtiste: first.logo_artiste || '',
      eventImage: metaCheck?.image ?? null,
      events,
      allSoldOut,
      slug,
    },
    revalidate: 60,
  }
}
