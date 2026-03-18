// components/EvenementCard.tsx
import Link from 'next/link'
import Image from 'next/image'
import { useTranslation } from 'next-i18next'

interface Props {
  artiste: string
  ville: string
  imageUrl: string
  dates: string[]
  slugEvent: string
  slugDates?: string[]
}

export default function EvenementCard({ artiste, ville, imageUrl, dates, slugEvent, slugDates }: Props) {
  const { t } = useTranslation('common')
  const hasMultipleDates = Array.isArray(slugDates) && slugDates.length > 1
  const href = hasMultipleDates ? `/${slugEvent}` : `/${slugEvent}/${slugDates![0]}`

  return (
    <Link href={href} className="group block">
      <div className="rounded-lg overflow-hidden bg-white border border-[#E5E5E0] hover:shadow-md transition-all duration-200">
        <div className="relative w-full h-52 overflow-hidden">
          <Image
            src={imageUrl}
            alt={artiste}
            layout="fill"
            objectFit="cover"
            className="group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="p-4">
          <h3
            className="text-lg font-semibold text-[#111111] truncate mb-0.5"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            {artiste}
          </h3>
          <p className="text-sm text-gray-500 mb-1">{ville}</p>
          <p className="text-sm text-gray-400">
            {hasMultipleDates
              ? `${slugDates!.length} ${t('home.dates_available')}`
              : dates[0]
            }
          </p>
          <div className="mt-3">
            <span className="inline-block bg-[#1a3a2a] text-white text-xs font-medium px-3 py-1.5 rounded-md">
              {t('common.see_tickets')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
