// pages/[slug]/[date].tsx
import { GetStaticPaths, GetStaticProps } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import PanZoomMap from '@/components/PanZoomMap'
import EventHeader from '@/components/EventHeader'
import { supabase } from '@/supabaseClient'
import { useCart } from '@/context/cartContext'

type Billet = {
  id_billet: string
  categorie: string
  quantite: number
  prix: number
  disponible: boolean
  evenement: string
  ville: string
  pays: string
  map_png: string
  map_svg: string
  zone_id: string
  logo_artiste?: string
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
  pngSrc: string | null
  svgSrc: string | null
  stockPerZone: Record<string, number>
  logoArtiste: string
  events: EventItem[]
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

const getQuantitesValides = (billet: Billet) => {
  const cat = extraireCategorie(billet.categorie).toLowerCase()
  if (['fosse', 'pelouse', 'pelouse or'].includes(cat)) {
    return Array.from({ length: billet.quantite }, (_, i) => i + 1)
  }
  const q = billet.quantite
  return Array.from({ length: q }, (_, i) => i + 1).filter(n => q - n !== 1)
}

export default function EventDatePage({
  billets,
  evenementName,
  locationLabel,
  pngSrc,
  svgSrc,
  stockPerZone,
  logoArtiste,
  events,
}: PageProps) {
  const router = useRouter()
  const { cart, addToCart } = useCart()
  const { slug, date } = router.query as { slug: string; date: string }

  const [search, setSearch] = useState('')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreQuantite, setFiltreQuantite] = useState('')
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [filteredBillets, setFilteredBillets] = useState<Billet[]>(billets)
  const [confirmationMessage, setConfirmationMessage] = useState('')

  useEffect(() => {
    const init: Record<string, number> = {}
    billets.forEach(b => {
      init[b.id_billet] = 1
    })
    setSelectedQuantities(init)
  }, [billets])

  useEffect(() => {
    let result = billets
    if (selectedZone) result = result.filter(b => b.zone_id === selectedZone)
    if (filtreCategorie) result = result.filter(b => extraireCategorie(b.categorie) === filtreCategorie)
    if (filtreQuantite) {
      const q = Number(filtreQuantite)
      result = result.filter(b => getQuantitesValides(b).includes(q))
    }
    setFilteredBillets(result)
  }, [billets, selectedZone, filtreCategorie, filtreQuantite])

  const categoriesDisponibles = Array.from(
    new Set(billets.map(b => extraireCategorie(b.categorie)))
  ).sort((a, b) => ordreCategories.indexOf(a) - ordreCategories.indexOf(b))
  const quantiteMax = Math.max(...billets.map(b => b.quantite), 1)

  const handleZoneSelect = (zoneId: string) => {
    setSelectedZone(prev => (prev === zoneId ? null : zoneId))
  }
  const handleZoneHover = (zoneId: string | null) => {
    setHoveredZone(zoneId)
  }

  return (
    <div className="min-h-screen bg-black text-white p-0 md:p-6 overflow-hidden">
      {/* HEADER */}
      <EventHeader
        logoUrl={`/images/artistes/${logoArtiste}`}
        evenementName={evenementName}
        date={date}
        locationLabel={locationLabel}
        filtreQuantite={filtreQuantite}
        setFiltreQuantite={setFiltreQuantite}
        quantiteMax={quantiteMax}
        categoriesDisponibles={categoriesDisponibles}
        filtreCategorie={filtreCategorie}
        setFiltreCategorie={setFiltreCategorie}
        search={search}
        setSearch={setSearch}
        events={events}
      />

      {/* Conteneur principal : flex-col sur mobile, flex-row sur md+ */}
      <div className="flex flex-col md:flex-row w-full" style={{ height: 'calc(100vh - 150px)' }}>
        {/* ========== SECTION CARTE ========== */}
        <div className="w-full md:w-[60%] h-[50vh] md:h-full flex justify-center items-center">
          <div className="w-full h-full md:w-[96%] md:h-[96%] bg-white rounded-2xl shadow flex items-center justify-center">
            <PanZoomMap
              pngSrc={pngSrc || ''}
              svgSrc={svgSrc || ''}
              stockPerZone={stockPerZone}
              onSelect={handleZoneSelect}
              onHover={handleZoneHover}
            />
          </div>
        </div>

        {/* ======== SECTION BILLETS ======== */}
        <div className="w-full md:w-[40%] h-[50vh] md:h-full overflow-y-auto px-0 md:px-4 relative bg-[#171B24]">
          {/* Sticky notification */}
          {confirmationMessage && (
            <div className="sticky top-0 z-10 bg-black py-2">
              <div
                className={`text-center font-medium ${
                  confirmationMessage ===
                    'Merci de sélectionner au minimum 2 places afin de ne pas laisser une seule place disponible.'
                    ? 'text-white'
                    : 'text-green-400'
                  }`}
              >
                {confirmationMessage}
              </div>
            </div>
          )}

          {selectedZone && (
            <div className="mb-4 px-2">
              <button
                onClick={() => setSelectedZone(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                ← Revenir à tous les billets
              </button>
            </div>
          )}

          <div className="flex flex-col gap-4 p-2">
            {filteredBillets.length === 0 ? (
              <p className="text-gray-400 italic">Aucun billet disponible.</p>
            ) : (
              filteredBillets.map(billet => (
                <div
                  key={billet.id_billet}
                  onMouseEnter={() => handleZoneHover(billet.zone_id)}
                  onMouseLeave={() => handleZoneHover(null)}
                  className="bg-[#1F2128] p-4 md:p-5 rounded-xl border border-gray-700 flex items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold mb-1">
                      {extraireCategorie(billet.categorie)}
                    </h2>
                    <p className="mb-1 text-gray-400">
                      {billet.prix} € — {billet.quantite} dispo
                    </p>
                  </div>

                  {billet.quantite === 0 ? (
                    <div className="text-red-500 font-semibold">💥 Épuisé</div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2 md:mt-0">
                      <select
                        value={selectedQuantities[billet.id_billet]}
                        onChange={e =>
                          setSelectedQuantities(prev => ({
                            ...prev,
                            [billet.id_billet]: Number(e.target.value),
                          }))
                        }
                        className="bg-gray-800 text-white px-3 py-2 rounded-lg"
                      >
                        {getQuantitesValides(billet).map(q => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>

                      {/* Ajouter au panier */}
                      <button
                        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium"
                        onClick={e => {
                          const selectEl = (e.currentTarget.parentElement as HTMLElement)
                            .querySelector('select')
                          const qty = selectEl
                            ? Number((selectEl as HTMLSelectElement).value)
                            : 1
                          const existing = cart.find(i => i.id_billet === billet.id_billet)
                          const already = existing ? existing.quantite : 0

                          // 1) Ne pas laisser exactement 1 place seule
                          const remainingAfter = billet.quantite - (already + qty)
                          if (remainingAfter === 1) {
                            setConfirmationMessage(
                              `Merci de sélectionner au minimum 2 places afin de ne pas laisser une seule place disponible.`
                            )
                            setTimeout(() => setConfirmationMessage(''), 5500)
                            return
                          }

                          // 2) Vérifier qu’on ne dépasse pas le stock
                          if (already + qty > billet.quantite) {
                            const maxAdd = billet.quantite - already
                            setConfirmationMessage(
                              `❌ Impossible d'ajouter ${qty} billet${qty > 1 ? 's' : ''} : ` +
                              `Vous avez déjà ${already} billet${already > 1 ? 's' : ''} ` +
                              `et il ne reste que ${maxAdd} place${maxAdd > 1 ? 's' : ''}.`
                            )
                            setTimeout(() => setConfirmationMessage(''), 4000)
                            return
                          }

                          // 3) Ajout au panier
                          addToCart(billet, qty)
                          setConfirmationMessage(
                            `✅ ${qty} billet${qty > 1 ? 's' : ''} ajouté${qty > 1 ? 's' : ''} au panier`
                          )
                          setTimeout(() => setConfirmationMessage(''), 4000)
                        }}
                      >
                        Ajouter au panier
                      </button>

                      {/* Acheter maintenant */}
                      <button
                        className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-lg font-medium"
                        onClick={e => {
                          const selectEl = (e.currentTarget.parentElement as HTMLElement)
                            .querySelector('select')
                          const qty = selectEl
                            ? Number((selectEl as HTMLSelectElement).value)
                            : 1

                          fetch('/api/checkout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cartItems: [{ ...billet, quantite: qty }] }),
                          })
                            .then(r => r.json())
                            .then(data => {
                              if (data.url) window.location.href = data.url
                              else throw new Error()
                            })
                            .catch(() =>
                              setConfirmationMessage('❌ Impossible de lancer le paiement.')
                            )
                        }}
                      >
                        Acheter maintenant
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- static paths & props ---
export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await supabase
    .from('billets')
    .select('slug')
    .eq('disponible', true)

  const uniq = new Set<string>()
  ;(data || []).forEach(b => {
    const parts = b.slug.split('-')
    const slug = parts[0]
    const date = parts.slice(-3).join('-')
    uniq.add(`${slug}___${date}`)
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

  // on récupère les billets pour la date
  const { data, error } = await supabase
    .from('billets')
    .select('*, logo_artiste')
    .ilike('slug', `${slug}-%`)
    .eq('date', dateParam)
    .eq('disponible', true)

  const billets = data as Billet[]

  if (error || !billets || billets.length === 0) {
    return { notFound: true }
  }

  // on calcule les stocks par zone
  const stockPerZone = billets.reduce((acc, b) => {
    acc[b.zone_id] = (acc[b.zone_id] || 0) + b.quantite
    return acc
  }, {} as Record<string, number>)

  // on construit la liste unique des events pour la search-dropdown
  const { data: all, error: err2 } = await supabase
    .from('billets')
    .select('evenement, slug, logo_artiste, date')
    .eq('disponible', true)

  const eventsMap = new Map<string, EventItem>()
  ;(all || []).forEach(r => {
    const name = r.evenement
    const slugEvent = (r.slug as string).split('-')[0]
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
      pngSrc: first.map_png ? `/images/maps/${first.map_png}` : null,
      svgSrc: first.map_svg ? `/images/maps/${first.map_svg}` : null,
      stockPerZone,
      logoArtiste: first.logo_artiste || '',
      events,
    },
    revalidate: 60,
  }
}





