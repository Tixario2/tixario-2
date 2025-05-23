// components/Header.tsx
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/supabaseClient'

type EventMenuItem = {
  nom: string
  slugEvent: string
  dates: string[]
  logo_artiste?: string
}

type BilletRecord = {
  evenement: string
  slug: string
  date: string
  logo_artiste?: string | null
}

export default function Header() {
  const [menuItems, setMenuItems] = useState<EventMenuItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const closeTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const fetchMenu = async () => {
      const { data, error } = await supabase
        .from('billets')
        .select<BilletRecord>('evenement, slug, date, logo_artiste')
      if (error || !data) return

      const map = new Map<string, EventMenuItem>()
      data.forEach(r => {
        const name = r.evenement
        const [slugEvent] = r.slug.split('-')
        const dateIso = r.date
        const logo = r.logo_artiste ?? undefined
        if (!map.has(name)) {
          map.set(name, {
            nom: name,
            slugEvent,
            dates: [],
            logo_artiste: logo,
          })
        }
        const ev = map.get(name)!
        if (dateIso && !ev.dates.includes(dateIso)) {
          ev.dates.push(dateIso)
        }
      })

      const list = Array.from(map.values())
      list.forEach(ev => ev.dates.sort())
      list.sort(
        (a, b) =>
          new Date(a.dates[0]).getTime() - new Date(b.dates[0]).getTime()
      )
      setMenuItems(list.slice(0, 8))
    }

    fetchMenu()
  }, [])

  const handleMouseEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setIsOpen(false)
      closeTimer.current = null
    }, 200)
  }

  return (
    <header className="bg-black text-white py-4 px-6 border-b border-gray-800">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold">
          Tixario
        </Link>

        <nav className="flex gap-6 text-sm items-center">
          <Link href="/">Accueil</Link>

          <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <span className="cursor-pointer">Événements ▾</span>
            <div
              className={
                `
                absolute top-full left-0 mt-2 bg-gray-900 text-white border border-gray-700
                rounded min-w-[200px] z-50 transition-opacity duration-200
                ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
              `}
            >
              {menuItems.map((ev, i) => {
                const href =
                  ev.dates.length > 1
                    ? `/${ev.slugEvent}`
                    : `/${ev.slugEvent}/${ev.dates[0]}`
                return (
                  <Link
                    key={i}
                    href={href}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-gray-800 whitespace-nowrap"
                  >
                    {ev.logo_artiste && (
                      <div className="relative w-6 h-6">
                        <Image
                          src={`/images/artistes/${ev.logo_artiste}`}
                          alt={`${ev.nom} logo`}
                          layout="fill"
                          objectFit="cover"
                          className="rounded-full"
                        />
                      </div>
                    )}
                    <span>{ev.nom}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          <Link href="/contact" className="hover:underline">
            Contact
          </Link>
        </nav>
      </div>
    </header>
  )
}
