// components/EventHeader.tsx
import Image from 'next/image'
import Link from 'next/link'

interface EventItem {
  nom: string
  slugEvent: string
  dates: string[]
  logo_artiste?: string
}

interface EventHeaderProps {
  logoUrl: string
  evenementName: string
  date: string
  locationLabel: string
  filtreQuantite: string
  setFiltreQuantite: (q: string) => void
  quantiteMax: number
  categoriesDisponibles: string[]
  filtreCategorie: string
  setFiltreCategorie: (c: string) => void
  search: string
  setSearch: (s: string) => void
  events: EventItem[]
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
  events,
}: EventHeaderProps) {
  return (
    <header className="bg-black text-white py-4 px-6 border-b border-gray-800">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
        {/* Gauche : lien Tixario + (logo_artiste + titre) */}
        <div className="flex items-center w-full md:w-auto mb-4 md:mb-0">
          <Link href="/" className="text-2xl font-bold mr-4">
            Tixario
          </Link>
          <div className="flex items-center">
            <div className="w-20 h-20 md:w-12 md:h-12 mr-4">
              <Image
                src={logoUrl}
                alt="logo artiste"
                width={96}
                height={96}
                className="object-contain"
              />
            </div>
            <h1 className="text-lg md:text-3xl font-bold whitespace-nowrap">
              {evenementName}
            </h1>
          </div>
        </div>

        {/* Centre : barre de recherche */}
        <div className="flex-1 w-full md:w-auto mb-4 md:mb-0 md:mx-4">
          <input
            type="text"
            placeholder="Rechercher un événement"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white text-black rounded px-4 py-2"
          />
        </div>

        {/* Droite : filtres */}
        <div className="flex flex-wrap gap-2 md:gap-4 items-center">
          <select
            value={filtreQuantite}
            onChange={e => setFiltreQuantite(e.target.value)}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm"
          >
            <option value="">Quantité</option>
            {Array.from({ length: quantiteMax }, (_, i) => i + 1).map(q => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>

          <select
            value={filtreCategorie}
            onChange={e => setFiltreCategorie(e.target.value)}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm"
          >
            <option value="">Catégorie</option>
            {categoriesDisponibles.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            onChange={e => {
              const chosen = e.target.value
              if (chosen) {
                window.location.href = `/${chosen}/${date}`
              }
            }}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm"
          >
            <option value="">Événements</option>
            {events.map(ev => {
              const href = ev.dates.length > 1
                ? `/${ev.slugEvent}`
                : `/${ev.slugEvent}/${ev.dates[0]}`
              return (
                <option key={ev.nom} value={ev.slugEvent}>
                  {ev.nom} ({ev.dates.join(', ')})
                </option>
              )
            })}
          </select>
        </div>
      </div>
    </header>
  )
}







