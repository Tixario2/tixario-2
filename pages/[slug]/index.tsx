// pages/[slug]/index.tsx

import { supabase } from '@/supabaseClient'
import Link from 'next/link'
import { GetStaticPaths, GetStaticProps } from 'next'
import Header from '@/components/Header'
import { useState, useMemo } from 'react'

interface EventDate {
  slug: string
  dateIso: string    // Date brute au format ISO (“2025-06-03”)
  date: string       // Date formatée avec session, ex. “3 juin 2025 (Quart de finale journée)”
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

  // 1) Récupérer date ISO + session + autres champs
  const { data, error } = await supabase
    .from('billets')
    .select('slug, date, session, ville, pays, evenement, logo_artiste')
    .ilike('slug', `${slug}-%`)
    .order('date', { ascending: true })

  if (error || !data || data.length === 0) {
    return { notFound: true }
  }

  // 2) Dé-dup par slug+dateIso
  const seen = new Set<string>()
  const dates: EventDate[] = []
  data.forEach(row => {
    const dateIso = row.date!                             // ex. "2025-06-03"
    const session = row.session || ''                      // ex. "Quart de finale journée"
    const key = `${row.slug}-${dateIso}`
    if (!seen.has(key)) {
      seen.add(key)

      // a) formater la date ISO en "3 juin 2025"
      const formattedDate = new Date(dateIso).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      // b) concaténer avec la session si présente
      const dateWithSession = session
        ? `${formattedDate} (${session})`
        : formattedDate

      dates.push({
        slug: row.slug!,
        dateIso,                  // POUR L’URL
        date: dateWithSession,    // POUR L’AFFICHAGE
        ville: row.ville!,
        pays: row.pays!,
      })
    }
  })

  // 3) Récupérer le nom de l’événement & le logo à partir du premier enregistrement
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

  // 2) Calculer les options uniques pour les dropdowns
  const cities = useMemo(
    () => Array.from(new Set(dates.map(d => d.ville))),
    [dates]
  )
  const availableDates = useMemo(
    () => Array.from(new Set(dates.map(d => d.date))),
    [dates]
  )

  // 3) Filtrer selon ville et date affichée
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
                    {/* dt est par exemple "3 juin 2025 (Quart de finale journée)" */}
                  </option>
                ))}
              </select>
            </div>

            {/* Cartes de dates */}
            {filteredDates.length > 0 ? (
              filteredDates.map(d => (
                <Link
                  key={`${d.slug}-${d.dateIso}`}
                  href={`/${slug}/${d.dateIso}`}
                  className="block bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm transition mb-4 text-black"
                >
                  <div>
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



