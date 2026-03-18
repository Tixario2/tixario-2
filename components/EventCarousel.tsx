// components/EventCarousel.tsx
import { useRef } from 'react'
import Link from 'next/link'
import { FeaturedEvent } from '@/lib/eventUtils'

interface EventCarouselProps {
  title: string
  exploreLink?: string
  exploreLinkLabel?: string
  events: FeaturedEvent[]
  locale: string
  light?: boolean
}

function CarouselCard({ event, locale, light }: { event: FeaturedEvent; locale: string; light?: boolean }) {
  const href = event.nbDates === 1
    ? `/${event.slugEvent}/${event.date}`
    : `/${event.slugEvent}`

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  const dateLabel = event.date
    ? event.dateEnd && event.dateEnd !== event.date
      ? `${fmtDate(event.date)} — ${fmtDate(event.dateEnd)}`
      : fmtDate(event.date)
    : ''

  const imgSrc = event.image
    ? event.image.startsWith('http') ? event.image : `/images/events/${event.image}`
    : null

  const cls = light ? 'dk-card dk-card--light' : 'dk-card'

  return (
    <Link href={href} className={cls}>
      <div className="dk-card__img">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={event.nom} className="dk-card__photo" />
        ) : (
          <span className="dk-card__initial">{event.nom.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="dk-card__body">
        <p className="dk-card__name">{event.nom}</p>
        <p className="dk-card__venue">{event.locationLabel}</p>
        <p className="dk-card__date">{dateLabel}</p>
        <div className="dk-card__bottom">
          {event.prixFrom > 0 && (
            <span className="dk-card__price">From &euro;{Math.round(event.prixFrom)}</span>
          )}
          <span className="dk-card__view">View &rarr;</span>
        </div>
      </div>
    </Link>
  )
}

export default function EventCarousel({ title, exploreLink, exploreLinkLabel, events, locale, light }: EventCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    trackRef.current?.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' })
  }

  const wrapCls = light ? 'ec-wrap ec-wrap--light' : 'ec-wrap'

  return (
    <div className={wrapCls}>
      <div className="ec-head">
        <div className="ec-left">
          <h2 className="ec-title">{title}</h2>
          {exploreLink && (
            <Link href={exploreLink} className="ec-pill">
              {exploreLinkLabel || 'View all \u2192'}
            </Link>
          )}
        </div>
        {events.length > 0 && (
          <div className="ec-arrows">
            <button className="ec-arrow" onClick={() => scroll('left')} aria-label="Previous">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button className="ec-arrow" onClick={() => scroll('right')} aria-label="Next">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {events.length === 0 ? (
        <p className="ec-empty">&mdash;</p>
      ) : (
        <div className="ec-track" ref={trackRef}>
          {events.map(ev => (
            <CarouselCard key={ev.slugEvent} event={ev} locale={locale} light={light} />
          ))}
        </div>
      )}

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        .ec-wrap {
          max-width: 1200px;
          margin: 0 auto;
        }
        .ec-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .ec-title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 34px;
          font-weight: 400;
          color: #FAFAF8;
          letter-spacing: -0.01em;
          margin: 0;
        }
        .ec-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .ec-pill {
          display: inline-block;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: white;
          background: #1a3a2a;
          border: none;
          border-radius: 999px;
          padding: 8px 20px;
          text-decoration: none;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .ec-pill:hover { background: #142e20; }
        .ec-arrows {
          display: flex;
          gap: 0.5rem;
        }
        .ec-arrow {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255,255,255,0.08);
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .ec-arrow:hover { background: rgba(255,255,255,0.15); }
        .ec-track {
          display: flex;
          flex-direction: row;
          gap: 14px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding-bottom: 8px;
        }
        .ec-track::-webkit-scrollbar { display: none; }
        .ec-track { scrollbar-width: none; }
        .ec-empty {
          text-align: center;
          color: rgba(255,255,255,0.3);
          padding: 3rem 0;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* ── Card ─────────────────────────────────────────── */
        .dk-card {
          flex-shrink: 0;
          width: 260px;
          background: #161616;
          border-radius: 12px;
          overflow: hidden;
          text-decoration: none;
          scroll-snap-align: start;
          transition: transform 0.18s ease;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.04);
        }
        .dk-card:hover { transform: scale(1.02); }
        .dk-card__img {
          width: 100%;
          height: 160px;
          background: #1a3a2a;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .dk-card__photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .dk-card__initial {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 40px;
          font-weight: 400;
          color: white;
          opacity: 0.6;
          line-height: 1;
        }
        .dk-card__body {
          padding: 14px;
          display: flex;
          flex-direction: column;
        }
        .dk-card__name {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #FAFAF8;
          margin: 0 0 4px;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dk-card__venue {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: rgba(255,255,255,0.5);
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dk-card__date {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: rgba(255,255,255,0.5);
          margin: 0 0 12px;
        }
        .dk-card__bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dk-card__price {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #FAFAF8;
        }
        .dk-card__view {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          color: rgba(255,255,255,0.4);
          margin-left: auto;
        }

        /* ── Light mode overrides ─────────────────────────── */
        .ec-wrap--light .ec-title { color: #111111; }
        .ec-wrap--light .ec-arrow {
          background: rgba(0,0,0,0.06);
          color: #111111;
        }
        .ec-wrap--light .ec-arrow:hover { background: rgba(0,0,0,0.12); }
        .ec-wrap--light .ec-empty { color: #6b7280; }

        /* ── Light card variant ───────────────────────────── */
        .dk-card--light {
          background: white;
          border: 1px solid #E5E5E0;
          box-shadow: none;
        }
        .dk-card--light .dk-card__name { color: #111111; }
        .dk-card--light .dk-card__venue { color: rgba(0,0,0,0.5); }
        .dk-card--light .dk-card__date { color: rgba(0,0,0,0.5); }
        .dk-card--light .dk-card__price { color: #111111; }
        .dk-card--light .dk-card__view { color: #6b7280; }
      `}</style>
    </div>
  )
}
