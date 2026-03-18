// components/FiltersBar.tsx
import React, { useState } from 'react'

interface Props {
  countries: string[]
  cities: string[]
  popularCities: string[]
  search: string
  setSearch: (s: string) => void
  selectedCountry: string
  setSelectedCountry: (c: string) => void
  selectedCity: string
  setSelectedCity: (c: string) => void
  dateFrom: string
  setDateFrom: (d: string) => void
  dateTo: string
  setDateTo: (d: string) => void
}

const inputClass = 'px-3 py-2 rounded-md bg-white text-[#111111] placeholder-gray-400 border border-[#E5E5E0] focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] text-sm'

export default function FiltersBar({
  countries, cities, popularCities,
  search, setSearch,
  selectedCountry, setSelectedCountry,
  selectedCity, setSelectedCity,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
}: Props) {
  const [qCountry, setQCountry] = useState('')
  const [qCity, setQCity] = useState('')

  const filtCountries = qCountry === ''
    ? countries
    : countries.filter(c => c.toLowerCase().includes(qCountry.toLowerCase()))

  const filtCities = qCity === ''
    ? cities
    : cities.filter(n => n.toLowerCase().includes(qCity.toLowerCase()))

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E0] shadow-sm p-4 flex flex-wrap gap-3 items-center">
      {/* Search */}
      <input
        type="text"
        className={`flex-1 min-w-[180px] ${inputClass}`}
        placeholder="Rechercher artiste/événement"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Country */}
      <div className="relative group w-40">
        <input
          type="text"
          placeholder="Pays"
          className={`w-full ${inputClass}`}
          value={selectedCountry}
          onChange={e => { setQCountry(e.target.value); setSelectedCountry('') }}
        />
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-auto bg-white text-[#111111] border border-[#E5E5E0] rounded-lg shadow-md hidden group-hover:block group-focus-within:block z-10">
          {filtCountries.length === 0 && (
            <li className="px-4 py-2 text-gray-400 text-sm">Aucun pays</li>
          )}
          {filtCountries.map(c => (
            <li
              key={c}
              className="px-4 py-2 hover:bg-[#FAFAF8] cursor-pointer text-sm"
              onClick={() => { setSelectedCountry(c); setQCountry(''); setSelectedCity(''); setQCity('') }}
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* City */}
      <div className="relative group w-40">
        <input
          type="text"
          placeholder="Ville"
          className={`w-full ${inputClass}`}
          value={selectedCity}
          onChange={e => { setQCity(e.target.value); setSelectedCity('') }}
        />
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-auto bg-white text-[#111111] border border-[#E5E5E0] rounded-lg shadow-md hidden group-hover:block group-focus-within:block z-10">
          <li className="px-4 py-1 text-xs text-gray-400 uppercase tracking-wide">Villes populaires</li>
          {popularCities.map(v => (
            <li key={`pop-${v}`} className="px-4 py-2 hover:bg-[#FAFAF8] cursor-pointer text-sm"
              onClick={() => { setSelectedCity(v); setQCity('') }}>
              {v}
            </li>
          ))}
          <li className="px-4 py-1 text-xs text-gray-400 uppercase tracking-wide border-t border-[#E5E5E0] mt-1">Toutes les villes</li>
          {filtCities.map(v => (
            <li key={v} className="px-4 py-2 hover:bg-[#FAFAF8] cursor-pointer text-sm"
              onClick={() => { setSelectedCity(v); setQCity('') }}>
              {v}
            </li>
          ))}
        </ul>
      </div>

      {/* Date range */}
      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
        className={inputClass} />
      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
        className={inputClass} />

      {/* Search button */}
      <button className="px-5 py-2 bg-[#1a3a2a] text-white text-sm font-medium rounded-md hover:bg-[#15302a] transition-colors">
        Rechercher
      </button>
    </div>
  )
}
