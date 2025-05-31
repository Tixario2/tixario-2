// components/EventHeader.tsx
import React, { useState, useRef, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useRouter } from 'next/router'
import { supabase } from '@/supabaseClient'
import { useCart } from '@/context/cartContext'
import { ShoppingCart } from 'lucide-react'
import Image from 'next/image'

interface EventItem {
  nom: string
  slugEvent: string
  logo?: string
  dates: string[]
}

interface EventHeaderProps {
  logoUrl: string
  evenementName: string
  date: string               // ISO "YYYY-MM-DD"
  locationLabel: string

  // filtres billet
  filtreQuantite: string
  setFiltreQuantite: (q: string) => void
  quantiteMax: number
  categoriesDisponibles: string[]
  filtreCategorie: string
  setFiltreCategorie: (c: string) => void

  // mini-search événements
  search: string
  setSearch: (s: string) => void

  // CORRECTION : ajoute events ici !
  events: EventItem[]
}

interface BilletRecord {
  evenement: string
  slug: string
  date: string
  logo_artiste?: string | null
}

export default function EventHeader({
  logoUrl,
  evenementName,
  date,
  locationLabel,
  filtreQuantite,
  setFiltreQuantite,
  quantiteMax,
  categoriesDisponibles,
  filtreCategorie,
  setFiltreCategorie,
  search,
  setSearch,
  events, // <-- correction ici aussi
}: EventHeaderProps) {
  const router = useRouter()
  const { cart = [] } = useCart() as { cart: Array<{ quantite: number }> }
  const ticketCount = cart.reduce((sum, item) => sum + (item.quantite || 0), 0)

  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch + assemble events list
  const [eventsList, setEventsList] = useState<EventItem[]>([])
  useEffect(() => {
    const fetchMenu = async () => {
      const { data, error } = await supabase
        .from<'billets', BilletRecord>('billets')
        .select('evenement, slug, date, logo_artiste')
        .order('date', { ascending: true })

      if (!error && data) {
        const map = new Map<string, EventItem>()
        data.forEach(r => {
          const name = r.evenement
          const parts = r.slug.split('-')
          const slugEvent = parts[0]
          const logo = r.logo_artiste ?? undefined
          const dateIso = r.date
          if (!map.has(name)) {
            map.set(name, { nom: name, slugEvent, logo, dates: [] })
          }
          const ev = map.get(name)!
          if (dateIso && !ev.dates.includes(dateIso)) {
            ev.dates.push(dateIso)
          }
        })
        const arr = Array.from(map.values()).map(ev => ({
          ...ev,
          dates: ev.dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        }))
        arr.sort((a, b) => new Date(a.dates[0]).getTime() - new Date(b.dates[0]).getTime())
        setEventsList(arr)
      }
    }
    fetchMenu()
  }, [])

  const open = () => setShowDropdown(true)
  const close = () => setTimeout(() => setShowDropdown(false), 150)

  const candidates = useMemo(() => {
    const base = search.trim() === ''
      ? eventsList
      : eventsList.filter(ev =>
          ev.nom.toLowerCase().includes(search.toLowerCase())
        )
    return base.slice(0, 8)
  }, [search, eventsList])

  return (
    <div className="mb-8">
      {/* ─── Ligne principale ─── */}
      <div className="flex items-center justify-between mb-6">
        {/* logo + titre */}
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12">
            <Image
              src={logoUrl}
              alt={evenementName}
              layout="fill"
              objectFit="cover"
              className="rounded-full border border-gray-700"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{evenementName}</h1>
            <p className="text-gray-300">
              {format(new Date(date), 'd MMMM yyyy', { locale: fr })}
              &nbsp;·&nbsp;<span className="align-text-bottom">📍</span> {locationLabel}
            </p>
          </div>
        </div>

        {/* mini-search + panier */}
        <div className="flex items-center gap-4">
          {/* Panier */}
          <div
            className="relative cursor-pointer"
            onClick={() => router.push('/panier')}
          >
            <ShoppingCart className="w-6 h-6 text-white" />
            {ticketCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-yellow-500 text-black rounded-full text-xs w-4 h-4 flex items-center justify-center">
                {ticketCount}
              </span>
            )}
          </div>

          {/* mini-search */}
          <div ref={containerRef} className="relative w-64">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={open}
              onBlur={close}
              placeholder="Rechercher un événement…"
              className="w-full px-4 py-2 rounded-lg bg-gray-900 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            {showDropdown && (
              <ul className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg max-h-60 overflow-auto">
                {candidates.length > 0 ? (
                  candidates.map(ev => {
                    const href = ev.dates.length > 1
                      ? `/${ev.slugEvent}`
                      : `/${ev.slugEvent}/${ev.dates[0]}`
                    return (
                      <li
                        key={ev.slugEvent}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-gray-700 cursor-pointer"
                        onMouseDown={() => router.push(href)}
                      >
                        {ev.logo && (
                          <Image
                            src={`/images/artistes/${ev.logo}`}
                            alt={`${ev.nom} logo`}
                            width={24}
                            height={24}
                            className="rounded-full object-cover"
                          />
                        )}
                        <span className="text-white">{ev.nom}</span>
                      </li>
                    )
                  })
                ) : (
                  <li className="px-4 py-2 text-gray-500">Aucun résultat</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ─── Toolbar filtres ─── */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={filtreQuantite}
          onChange={e => setFiltreQuantite(e.target.value)}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
        >
          <option value="">Nombre de billets</option>
          {Array.from({ length: quantiteMax }, (_, i) => i + 1).map(q => (
            <option key={q} value={q}>
              {q} billet{q > 1 ? 's' : ''}
            </option>
          ))}
        </select>

        <select
          value={filtreCategorie}
          onChange={e => setFiltreCategorie(e.target.value)}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
        >
          <option value="">Toutes les catégories</option>
          {categoriesDisponibles.map(cat => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}







