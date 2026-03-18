// components/EventCard.tsx
import Link from 'next/link'
import { FeaturedEvent, getInitials } from '@/lib/eventUtils'

interface EventCardProps {
  event: FeaturedEvent
  locale: string
  t: (k: string) => string
}

export default function EventCard({ event, locale, t }: EventCardProps) {
  const fmtSingle = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  const dateLabel = event.dateEnd && event.dateEnd !== event.date
    ? `${fmtSingle(event.date)} — ${fmtSingle(event.dateEnd)}`
    : fmtSingle(event.date)
  const initials = getInitials(event.nom)

  const imgSrc = event.image
    ? event.image.startsWith('http') ? event.image : `/images/events/${event.image}`
    : event.logoArtiste
      ? `/images/artistes/${event.logoArtiste}`
      : null

  const href = event.nbDates === 1
    ? `/${event.slugEvent}/${event.date}`
    : `/${event.slugEvent}`

  return (
    <>
      <Link href={href} className="ec-card">
        {/* Media */}
        <div className="ec-card__media">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgSrc} alt={event.nom} className="ec-card__img" />
          ) : (
            <div className="ec-card__fallback">
              <span className="ec-card__initials">{initials}</span>
            </div>
          )}
          {event.categorie && (
            <span className="ec-card__badge">{event.categorie}</span>
          )}
        </div>

        {/* Content */}
        <div className="ec-card__content">
          <div className="ec-card__body">
            <p className="ec-card__date">{dateLabel}</p>
            <h3 className="ec-card__name">{event.nom}</h3>
            <p className="ec-card__city">{event.locationLabel}</p>
          </div>
          <div className="ec-card__footer">
            <span className="ec-card__price">
              {event.prixFrom > 0 ? `${t('home.price_from')} €${Math.round(event.prixFrom)}` : ''}
            </span>
            <span className="ec-card__cta">{t('home.view_tickets')}</span>
          </div>
        </div>
      </Link>

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        .ec-card {
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          text-decoration: none;
          color: #111111;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .ec-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        .ec-card__media {
          position: relative;
          height: 180px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .ec-card__img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .ec-card:hover .ec-card__img { transform: scale(1.04); }
        .ec-card__fallback {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #243f30 0%, #0e1f16 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ec-card__initials {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 3.5rem;
          font-weight: 600;
          color: rgba(255,255,255,0.25);
          letter-spacing: 0.05em;
          line-height: 1;
          user-select: none;
        }
        .ec-card__badge {
          position: absolute;
          bottom: 0.625rem;
          left: 0.625rem;
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: white;
          background: rgba(26,58,42,0.85);
          backdrop-filter: blur(4px);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .ec-card__content {
          display: flex;
          flex-direction: column;
          flex: 1;
          padding: 1.25rem;
          gap: 0.75rem;
        }
        .ec-card__body { flex: 1; }
        .ec-card__date {
          font-size: 0.8125rem;
          color: #6b7280;
          margin: 0 0 0.25rem;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .ec-card__name {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #111111;
          margin: 0 0 0.25rem;
          line-height: 1.3;
        }
        .ec-card__city {
          font-size: 0.8125rem;
          color: #6b7280;
          margin: 0;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .ec-card__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.875rem;
          border-top: 1px solid #E5E5E0;
        }
        .ec-card__price {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #111111;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .ec-card__cta {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #1a3a2a;
          font-family: 'Inter', system-ui, sans-serif;
        }
      `}</style>
    </>
  )
}
