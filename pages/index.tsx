// pages/index.tsx
import EvenementCard from '@/components/EvenementCard';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import { supabase } from '@/supabaseClient';
import { useState, useMemo } from 'react';

const FiltersBar = dynamic(() => import('@/components/FiltersBar'), { ssr: false });

// Helper pour formater une date ISO en français
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

// Structure résumée d'un événement
type EventSummary = {
  nom: string;
  slugEvent: string;
  image: string | null;
  countries: string[];
  cities: string[];
  dates: string[];      // ISO date strings "YYYY-MM-DD"
};

export async function getStaticProps() {
  const { data: rows, error } = await supabase
    .from('billets')
    .select('evenement, image, ville, pays, date, slug');
  if (error) {
    console.error('Supabase error:', error);
    return {
      props: { events: [] as EventSummary[], countries: [], cities: [], popularCities: [] },
      revalidate: 60
    };
  }

  // Grouper par nom d'événement
  const map = new Map<string, EventSummary>();
  rows.forEach(r => {
    const name = r.evenement;
    // on prend le premier segment du slug complet stocké en base
    const slugEvent = r.slug.split('-')[0];

    if (!map.has(name)) {
      map.set(name, {
        nom: name,
        slugEvent,
        image: r.image ?? null,
        countries: [],
        cities: [],
        dates: []
      });
    }
    const ev = map.get(name)!;
    if (r.pays && !ev.countries.includes(r.pays)) ev.countries.push(r.pays);
    if (r.ville && !ev.cities.includes(r.ville)) ev.cities.push(r.ville);
    if (r.date) {
      const iso = new Date(r.date).toISOString().slice(0, 10);
      if (!ev.dates.includes(iso)) ev.dates.push(iso);
    }
  });
  const events = Array.from(map.values());

  // Listes pour les filtres
  const countries = Array.from(new Set(events.flatMap(e => e.countries)));
  const cities = Array.from(new Set(events.flatMap(e => e.cities)));

  // Top 3 villes populaires
  const counts: Record<string, number> = {};
  events.forEach(e => {
    const key = e.cities[0] || '';
    counts[key] = (counts[key] || 0) + 1;
  });
  const popularCities = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([ville]) => ville);

  return {
    props: { events, countries, cities, popularCities },
    revalidate: 60
  };
}

interface HomeProps {
  events: EventSummary[];
  countries: string[];
  cities: string[];
  popularCities: string[];
}

export default function Home({ events, countries, cities, popularCities }: HomeProps) {
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    let res = [...events];
    const q = search.trim().toLowerCase();
    if (q) res = res.filter(e => e.nom.toLowerCase().includes(q));
    if (selectedCountry) res = res.filter(e => e.countries.includes(selectedCountry));
    if (selectedCity) res = res.filter(e => e.cities.includes(selectedCity));
    if (dateFrom) {
      const from = new Date(dateFrom);
      res = res.filter(e => e.dates.some(d => new Date(d) >= from));
    }
    if (dateTo) {
      const to = new Date(dateTo);
      res = res.filter(e => e.dates.some(d => new Date(d) <= to));
    }
    return res;
  }, [events, search, selectedCountry, selectedCity, dateFrom, dateTo]);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-black px-4 py-8">
        <FiltersBar
          countries={countries}
          cities={cities}
          popularCities={popularCities}
          search={search} setSearch={setSearch}
          selectedCountry={selectedCountry} setSelectedCountry={setSelectedCountry}
          selectedCity={selectedCity} setSelectedCity={setSelectedCity}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
        />

        <h1 className="text-4xl font-bold text-center mb-12 text-white">
          Événements disponibles
        </h1>

        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 italic mt-10">Aucun événement trouvé.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(e => {
              // Affichage
              const line2 = e.dates.length === 1
                ? e.cities[0] || ''
                : (e.countries.length > 1 ? 'Tournée mondiale' : `Tournée ${e.countries[0]}`);
              const displayDates = e.dates.length === 1
                ? [formatDate(e.dates[0])]
                : [`${e.dates.length} dates disponibles`];

              // Pour construire les slugs de date (on garde l'ISO “YYYY-MM-DD”)
              const slugDates = e.dates.sort();

              return (
                <EvenementCard
                  key={e.slugEvent}
                  artiste={e.nom}
                  ville={line2}
                  imageUrl={`/images/events/${e.image ?? ''}`}
                  dates={displayDates}
                  slugEvent={e.slugEvent}
                  slugDates={slugDates}
                />
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}




