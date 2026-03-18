// lib/eventUtils.ts

export interface FeaturedEvent {
  slugEvent: string
  nom: string
  categorie: string
  type: string | null
  image: string | null
  logoArtiste: string | null
  date: string
  dateEnd: string
  ville: string
  locationLabel: string
  prixFrom: number
  nbDates: number
}

export interface SearchItem {
  nom: string
  slugEvent: string
  dates: string[]
  ville: string
}

export function cleanCategory(raw: string): string {
  return raw.split(/\s[–—-]\s/)[0].trim()
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

export function buildEventData(rows: any[]): {
  searchItems: SearchItem[]
  featured: FeaturedEvent[]
} {
  const searchMap = new Map<string, SearchItem>()
  const featuredMap = new Map<string, FeaturedEvent>()
  // Track distinct cities and all dates per slug
  const citiesMap = new Map<string, Set<string>>()
  const paysMap = new Map<string, string>()
  const datesMap = new Map<string, string[]>()

  ;(rows ?? []).forEach(r => {
    const slugEvent = r.slug
    const dateIso = r.date as string
    const prix = parseFloat(r.prix ?? '0')
    const ville = (r.ville as string) ?? ''
    const pays = (r.pays as string) ?? ''

    if (!searchMap.has(slugEvent)) {
      searchMap.set(slugEvent, {
        nom: r.evenement,
        slugEvent,
        dates: [],
        ville,
      })
    }
    const si = searchMap.get(slugEvent)!
    if (dateIso && !si.dates.includes(dateIso)) si.dates.push(dateIso)

    // Track cities
    if (!citiesMap.has(slugEvent)) citiesMap.set(slugEvent, new Set())
    if (ville) citiesMap.get(slugEvent)!.add(ville)
    if (pays && !paysMap.has(slugEvent)) paysMap.set(slugEvent, pays)

    // Track dates for min/max
    if (!datesMap.has(slugEvent)) datesMap.set(slugEvent, [])
    if (dateIso) datesMap.get(slugEvent)!.push(dateIso)

    if (!featuredMap.has(slugEvent)) {
      featuredMap.set(slugEvent, {
        slugEvent,
        nom: r.evenement,
        categorie: r.categorie ? cleanCategory(r.categorie) : '',
        type: r.type ?? null,
        image: r.image ?? null,
        logoArtiste: r.logo_artiste ?? null,
        date: dateIso,
        dateEnd: dateIso,
        ville,
        locationLabel: ville,
        prixFrom: prix,
        nbDates: 0,
      })
    } else {
      const fe = featuredMap.get(slugEvent)!
      if (prix > 0 && (fe.prixFrom === 0 || prix < fe.prixFrom)) fe.prixFrom = prix
    }
  })

  featuredMap.forEach((fe, key) => {
    fe.nbDates = searchMap.get(key)?.dates.length ?? 1

    // Compute date range
    const dates = datesMap.get(key) ?? []
    if (dates.length > 0) {
      dates.sort()
      fe.date = dates[0]
      fe.dateEnd = dates[dates.length - 1]
    }

    // Compute location label
    const cities = citiesMap.get(key)
    if (cities && cities.size > 1) {
      fe.locationLabel = paysMap.get(key) || Array.from(cities).join(', ')
    } else if (cities && cities.size === 1) {
      fe.locationLabel = Array.from(cities)[0]
    }
  })

  const featured = Array.from(featuredMap.values())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    searchItems: Array.from(searchMap.values()),
    featured,
  }
}
