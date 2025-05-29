// components/FiltersBar.tsx
import React, { useState } from 'react';

interface Props {
  countries: string[];
  cities: string[];
  popularCities: string[];
  search: string;
  setSearch: (s: string) => void;
  selectedCountry: string;
  setSelectedCountry: (c: string) => void;
  selectedCity: string;
  setSelectedCity: (c: string) => void;
  dateFrom: string;
  setDateFrom: (d: string) => void;
  dateTo: string;
  setDateTo: (d: string) => void;
}

export default function FiltersBar({
  countries,
  cities,
  popularCities,
  search,
  setSearch,
  selectedCountry,
  setSelectedCountry,
  selectedCity,
  setSelectedCity,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: Props) {
  const [qCountry, setQCountry] = useState('');
  const [qCity, setQCity] = useState('');

  const filtCountries = qCountry === ''
    ? countries
    : countries.filter(c =>
        c.toLowerCase().includes(qCountry.toLowerCase())
      );

  const filtCities = qCity === ''
    ? cities
    : cities.filter(n =>
        n.toLowerCase().includes(qCity.toLowerCase())
      );

  return (
    <div className="bg-[#111111] rounded-xl shadow-lg p-4 flex flex-wrap gap-4 items-center mb-8 border border-neutral-700">
      {/* Recherche */}
      <input
        type="text"
        className="flex-1 px-4 py-2 rounded-md bg-neutral-900 text-white placeholder-gray-400 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-white"
        placeholder="Rechercher artiste/événement"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Pays */}
      <div className="relative group w-40">
        <input
          type="text"
          placeholder="Pays"
          className="w-full px-3 py-2 rounded-md bg-neutral-900 text-white placeholder-gray-400 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-white"
          value={selectedCountry}
          onChange={e => {
            setQCountry(e.target.value);
            setSelectedCountry('');
          }}
        />
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-auto bg-neutral-800 text-white border border-neutral-600 rounded shadow-md hidden group-hover:block group-focus-within:block z-10">
          {filtCountries.length === 0 && (
            <li className="px-4 py-2 text-gray-400">Aucun pays</li>
          )}
          {filtCountries.map(c => (
            <li
              key={c}
              className="px-4 py-2 hover:bg-neutral-700 cursor-pointer"
              onClick={() => {
                setSelectedCountry(c);
                setQCountry('');
                setSelectedCity('');
                setQCity('');
              }}
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* Ville */}
      <div className="relative group w-40">
        <input
          type="text"
          placeholder="Ville"
          className="w-full px-3 py-2 rounded-md bg-neutral-900 text-white placeholder-gray-400 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-white"
          value={selectedCity}
          onChange={e => {
            setQCity(e.target.value);
            setSelectedCity('');
          }}
        />
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-auto bg-neutral-800 text-white border border-neutral-600 rounded shadow-md hidden group-hover:block group-focus-within:block z-10">
          <li className="px-4 py-1 text-xs text-gray-400 uppercase">
            Villes populaires
          </li>
          {popularCities.map(v => (
            <li
              key={`pop-${v}`}
              className="px-4 py-2 hover:bg-neutral-700 cursor-pointer"
              onClick={() => { setSelectedCity(v); setQCity(''); }}
            >
              {v}
            </li>
          ))}
          <li className="px-4 py-1 text-xs text-gray-400 uppercase">
            Toutes les villes
          </li>
          {filtCities.map(v => (
            <li
              key={v}
              className="px-4 py-2 hover:bg-neutral-700 cursor-pointer"
              onClick={() => { setSelectedCity(v); setQCity(''); }}
            >
              {v}
            </li>
          ))}
        </ul>
      </div>

      {/* Dates */}
      <input
        type="date"
        value={dateFrom}
        onChange={e => setDateFrom(e.target.value)}
        className="px-3 py-2 rounded-md bg-neutral-900 text-white border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-white"
      />
      <input
        type="date"
        value={dateTo}
        onChange={e => setDateTo(e.target.value)}
        className="px-3 py-2 rounded-md bg-neutral-900 text-white border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-white"
      />
    </div>
  );
}

