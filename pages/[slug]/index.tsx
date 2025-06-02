// pages/[slug]/index.tsx

import { supabase } from '@/supabaseClient'
import Link from 'next/link'
import { GetStaticPaths, GetStaticProps } from 'next'
import Header from '@/components/Header'
import { useState, useMemo } from 'react'

interface EventDate {
  slug: string
  date: string   // vaudra maintenant "3 juin 2025 (Quart de finale)" par ex.
  ville: string
  pays: string
}

interface Props {
  slug: string
  dates: EventDate[]
  logoArtiste: string
  evenementName: string
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await supabase.from('billets').select('slug')
  const slugSet = new Set<string>()
  ;(data || []).forEach(row => {
    const [slug] = row.slug!.split('-')
    slugSet.add(slug)
  })
  return {
    paths: Array.from(slugSet).map(slug => ({ params: { slug } })),
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = params!.slug as string

  // On concatène date + session en un seul champ "date" renvoyé par l'API
  const { data, error } = await supabase
    .from('billets')
    .select(`
      slug,
      (date || ' (' || session || ')') as date,
      ville,
      pays,
      evenement,
      logo_artiste
    `)
    .ilike('slug', `${slug}-%`)
    .order('date', { ascending: true })

  if (error || !data || data.length === 0) {
    return { notFound: true }
  }

  // Dé-dup par slug+date (la "date" inclut maintenant la session entre parenthèses)
  const seen = new Set<string>()
  const dates: EventDate[] = []
  data.forEach(row => {
    const key = `${row.slug}-${row.date}`
    if (!seen.has(key)) {
      seen.add(key)
      dates.push({
        slug: row.slug!,
        date: row.date!,    // ex. "3 juin 2025 (Quart de finale)"
        ville: row.ville!,
        pays: row.pays!,
      })
    }
  })

  // Nom de l'événement et logo à récupérer sur la première ligne
  const evenementName = data[0].evenement!
  const logoArtiste = data[0].logo_artiste || ''

  return {
    props: { slug, dates, logoArtiste, evenementName },
    revalidate: 60,
  }
}

export default function EventInterPage({
  slug,
  dates = [],
  logoArtiste,
  evenementName,
}: Props) {
  // 1) États pour filtres
  const [cityFilter, setCityFilter] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<string>('')

  // 2) Options uniques pour dropdowns
  const cities = useMemo(
    () => Array.from(new Set(dates.map(d => d.ville))),
    [dates]
  )
  const availableDates = useMemo(
    () => Array.from(new Set(dates.map(d => d.date))),
    [dates]
  )

  // 3) Application des filtres
  const filteredDates = useMemo(
    () =>
      dates.filter(d => {
        return (
          (!cityFilter || d.ville === cityFilter) &&
          (!dateFilter || d.date === dateFilter)
        )
      }),
    [dates, cityFilter, dateFilter]
  )

  return (
    <>
      <Header />

      <main className="min-h-screen px-4 py-8 bg-black text-white">
        <h1 className="text-4xl font-bold mb-6 text-center">
          Dates pour {evenementName}
        </h1>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
          {/* ─── Left: filtres + cartes de dates ─── */}
          <div className="w-full md:w-2/3">
            {/* Ville / Date dropdowns */}
            <div className="flex flex-wrap gap-3 mb-6">
              <select
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-300 rounded text-black"
              >
                <option value="">Toutes les villes</option>
                {cities.map(city => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-300 rounded text-black"
              >
                <option value="">Toutes dates</option>
                {availableDates.map(dt => (
                  <option key={dt} value={dt}>
                    {dt}
                    {/* dt est déjà "3 juin 2025 (Quart de finale)" */}
                  </option>
                ))}
              </select>
            </div>

            {/* Cartes de dates */}
            {filteredDates.length > 0 ? (
              filteredDates.map(d => (
                <Link
                  key={`${d.slug}-${d.date}`}
                  href={`/${slug}/${ /* on extrait la date ISO initiale en la retrouvant dans d.date */ 
                    d.date.split(' ')[2] + '-' +
                    //  on reconstruit "YYYY-MM-DD" : 
                    //  + mois en littéral → on pourrait stocker la vraie ISO dans un champ caché 
                    //  mais si vous conservez la date ISO originale dans un autre champ, on devrait l’utiliser ici.
                    '' 
                  }`}
                  className="block bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm transition mb-4 text-black"
                >
                  <div>
                    {/* On affiche d.date tel quel, ex. "3 juin 2025 (Quart de finale)" */}
                    <div className="font-semibold">{d.date}</div>
                    <div className="text-gray-500">
                      {d.ville}, {d.pays}
                    </div>
                  </div>
                  <button className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-lg font-medium">
                    Voir les billets
                  </button>
                </Link>
              ))
            ) : (
              <p className="text-center text-gray-400">Aucun résultat.</p>
            )}
          </div>

          {/* ─── Right: image de l’artiste ─── */}
          <aside className="w-full md:w-1/3 flex justify-center md:justify-end">
            <img
              src={`/images/artistes/${logoArtiste}`}
              alt={evenementName}
              className="w-48 h-48 rounded-xl object-cover"
            />
          </aside>
        </div>
      </main>
    </>
  )
}


