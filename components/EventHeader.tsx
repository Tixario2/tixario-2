// components/EventHeader.tsx
import Image from 'next/image'

interface EventItem {
  nom: string
  slugEvent: string
  logo: string
  dates: string[]
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
    <div className="flex flex-col md:flex-row items-center justify-between mb-6 px-4 md:px-0">
      {/* Logo + Titre */}
      <div className="flex items-center mb-4 md:mb-0">
        <div className="w-16 h-16 md:w-24 md:h-24 mr-4">
          <Image
            src={logoUrl}
            alt="logo artiste"
            width={96}
            height={96}
            className="object-contain"
          />
        </div>
        <h1 className="text-xl md:text-3xl font-bold whitespace-nowrap">
          {evenementName}
        </h1>
      </div>

      {/* Barre de recherche */}
      <div className="flex-1 mx-4 w-full md:w-auto">
        <input
          type="text"
          placeholder="Rechercher un événement"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white text-black rounded px-4 py-2"
        />
      </div>

      {/* Filtres (quantité, catégorie, dropdown événements) */}
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
          {events.map(ev => (
            <option key={ev.nom} value={ev.slugEvent}>
              {ev.nom} ({ev.dates.join(', ')})
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}







