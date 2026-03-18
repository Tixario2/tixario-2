// pages/[slug]/index.tsx
import { supabase } from '@/supabaseClient'
import Link from 'next/link'
import Head from 'next/head'
import { GetServerSideProps } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useState, useMemo, useCallback } from 'react'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'
import CalendarPicker from '@/components/CalendarPicker'

interface SubEvent {
  slug: string
  dateIso: string
  session: string | null
  session_fr: string | null
  ville: string
  pays: string
  lieu: string | null
  prixFrom: number | null
}

interface EventMeta {
  evenement: string
  type: string
  image: string | null
  seo_title_en: string | null
  seo_title_fr: string | null
  seo_description_en: string | null
  seo_description_fr: string | null
  seo_text_en: string | null
  seo_text_fr: string | null
}

interface Props {
  slug: string
  subEvents: SubEvent[]
  meta: EventMeta
  dateRange: string
  locationLabel: string
  allSoldOut: boolean
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, locale }) => {
  const slug = params!.slug as string

  // Fetch event_meta
  const { data: metaRow } = await supabase
    .from('event_meta')
    .select('evenement, type, image, seo_title_en, seo_title_fr, seo_description_en, seo_description_fr, seo_text_en, seo_text_fr, paused, archived')
    .eq('slug', slug)
    .single()

  // Block paused / archived events
  if (metaRow?.paused || metaRow?.archived) {
    return { notFound: true }
  }

  // Fetch billets for sub-events
  const { data: rows, error } = await supabase
    .from('billets')
    .select('slug, date, session, session_fr, ville, pays, lieu, prix, evenement, type, image, disponible, quantite')
    .eq('slug', slug)
    .order('date', { ascending: true })

  if (error || !rows || rows.length === 0) {
    return { notFound: true }
  }

  // Check if all billets are sold out
  const allSoldOut = rows.every(r => !r.disponible || r.quantite === 0)

  // Build meta from event_meta or fallback to billets
  const first = rows[0]
  const meta: EventMeta = metaRow ?? {
    evenement: first.evenement!,
    type: first.type ?? 'concert',
    image: first.image ?? null,
    seo_title_en: null,
    seo_title_fr: null,
    seo_description_en: null,
    seo_description_fr: null,
    seo_text_en: null,
    seo_text_fr: null,
  }

  // Group by session + date to build sub-events with min price
  const seMap = new Map<string, SubEvent>()
  for (const r of rows) {
    const dateIso = r.date!
    const session = r.session || null
    const key = `${session || ''}__${dateIso}`

    if (!seMap.has(key)) {
      seMap.set(key, {
        slug: r.slug!,
        dateIso,
        session,
        session_fr: r.session_fr || null,
        ville: r.ville!,
        pays: r.pays ?? '',
        lieu: r.lieu ?? null,
        prixFrom: null,
      })
    }

    const prix = r.prix != null ? Number(r.prix) : null
    if (prix != null && prix > 0) {
      const existing = seMap.get(key)!
      if (existing.prixFrom === null || prix < existing.prixFrom) {
        existing.prixFrom = prix
      }
    }
  }

  const subEvents = Array.from(seMap.values())

  // Date range
  const dates = subEvents.map(se => se.dateIso).sort()
  const fmtRange = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const dateRange = dates.length > 1 && dates[0] !== dates[dates.length - 1]
    ? `${fmtRange(dates[0])} — ${fmtRange(dates[dates.length - 1])}`
    : dates.length > 0 ? fmtRange(dates[0]) : ''

  // Location label
  const cities = [...new Set(subEvents.map(se => se.ville).filter(Boolean))]
  const countries = [...new Set(subEvents.map(se => se.pays).filter(Boolean))]
  const locationLabel = cities.length > 1
    ? (countries[0] || cities.join(', '))
    : (cities[0] || '')

  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'fr', ['common'])),
      slug,
      subEvents,
      meta,
      dateRange,
      locationLabel,
      allSoldOut,
    },
  }
}

function extractFaqFromHtml(html: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = []
  // Match <h3>...</h3> followed by content until next <h3> or end
  const regex = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const question = match[1].replace(/<[^>]+>/g, '').trim()
    const answer = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (question && answer) {
      faqs.push({ question, answer })
    }
  }
  return faqs
}

export default function EventPage({ slug, subEvents, meta, dateRange, locationLabel, allSoldOut }: Props) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const locale = router.locale ?? 'fr'
  const [cityFilter, setCityFilter] = useState('')
  const [dateFrom, setDateFrom] = useState<string | null>(null)
  const [dateTo, setDateTo] = useState<string | null>(null)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistMsg, setWaitlistMsg] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)

  const handleWaitlist = async () => {
    if (!waitlistEmail) return
    setWaitlistLoading(true)
    try {
      const res = await fetch('/api/waitlist/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: waitlistEmail }),
      })
      const data = await res.json()
      setWaitlistMsg(data.message || 'Subscribed!')
      setWaitlistEmail('')
    } catch {
      setWaitlistMsg('Something went wrong. Please try again.')
    }
    setWaitlistLoading(false)
  }

  const cities = useMemo(() => [...new Set(subEvents.map(se => se.ville))], [subEvents])
  const availableDates = useMemo(() => new Set(subEvents.map(se => se.dateIso)), [subEvents])
  const hasMultipleDates = availableDates.size > 1

  const onDateChange = useCallback((from: string | null, to: string | null) => {
    setDateFrom(from)
    setDateTo(to)
  }, [])

  const filtered = useMemo(() =>
    subEvents.filter(se => {
      if (cityFilter && se.ville !== cityFilter) return false
      if (dateFrom && se.dateIso < dateFrom) return false
      if (dateTo && se.dateIso > dateTo) return false
      return true
    }),
    [subEvents, cityFilter, dateFrom, dateTo]
  )

  const imgSrc = meta.image
    ? meta.image.startsWith('http') ? meta.image : `/images/events/${meta.image}`
    : null

  const seoTitle = locale === 'fr'
    ? (meta.seo_title_fr || meta.seo_title_en || `${meta.evenement} - Zenntry`)
    : (meta.seo_title_en || `${meta.evenement} - Zenntry`)
  const seoDesc = locale === 'fr'
    ? (meta.seo_description_fr || meta.seo_description_en || '')
    : (meta.seo_description_en || '')
  const seoText = locale === 'fr'
    ? (meta.seo_text_fr || meta.seo_text_en || '')
    : (meta.seo_text_en || '')

  const typeLabel = meta.type === 'sport' ? 'SPORT' : 'CONCERT'

  // Schema markup
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || 'https://zenntry.com')

  const faqItems = useMemo(() => seoText ? extractFaqFromHtml(seoText) : [], [seoText])
  const faqSchema = faqItems.length > 0 ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }) : null

  const eventSchemaData = subEvents.map(se => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: (locale === 'fr' && se.session_fr ? se.session_fr : se.session) || meta.evenement,
    startDate: se.dateIso,
    location: {
      '@type': 'Place',
      name: se.lieu || meta.evenement,
      address: {
        '@type': 'PostalAddress',
        addressLocality: se.ville,
        addressCountry: se.pays,
      },
    },
    ...(se.prixFrom != null ? {
      offers: {
        '@type': 'Offer',
        price: String(se.prixFrom),
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: `${siteUrl}/${slug}/${se.dateIso}`,
      },
    } : {}),
  }))
  const eventSchema = eventSchemaData.length > 0 ? JSON.stringify(eventSchemaData) : null

  const fmtCalendar = (iso: string) => {
    const d = new Date(iso)
    const month = d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'short' }).toUpperCase()
    const day = d.getDate()
    const weekday = d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' })
    return { month, day, weekday }
  }

  return (
    <>
      <Head>
        <title>{seoTitle}</title>
        {seoDesc && <meta name="description" content={seoDesc} />}
        {faqSchema && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchema }} />
        )}
        {eventSchema && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: eventSchema }} />
        )}
      </Head>

      <Header transparent />

      {/* Hero */}
      <section className="ev-hero">
        {imgSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={meta.evenement} className="ev-hero__bg" />
        )}
        <div className="ev-hero__overlay" />
        <div className="ev-hero__content">
          <p className="ev-hero__type">{typeLabel}</p>
          <h1 className="ev-hero__name">{meta.evenement}</h1>
          <p className="ev-hero__meta">{dateRange}{dateRange && locationLabel ? ' · ' : ''}{locationLabel}</p>
        </div>
      </section>

      {/* Date list */}
      <section className="ev-dates">
        <div className="ev-dates__inner">
          {allSoldOut ? (
            <div className="ev-soldout">
              <span className="ev-soldout__badge">Sold Out</span>
              <p className="ev-soldout__text">All tickets for this event are currently sold out.</p>
              {waitlistMsg ? (
                <p className="ev-soldout__success">{waitlistMsg}</p>
              ) : (
                <div className="ev-soldout__form">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={waitlistEmail}
                    onChange={e => setWaitlistEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleWaitlist()}
                    className="ev-soldout__input"
                  />
                  <button
                    onClick={handleWaitlist}
                    disabled={waitlistLoading || !waitlistEmail}
                    className="ev-soldout__btn"
                  >
                    {waitlistLoading ? 'Subscribing…' : 'Notify me when tickets are available'}
                  </button>
                </div>
              )}
            </div>
          ) : (
          <>
          {(cities.length > 1 || hasMultipleDates) && (
            <div className="ev-dates__filters">
              {cities.length > 1 && (
                <select
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  className="ev-dates__select"
                >
                  <option value="">All cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {hasMultipleDates && (
                <CalendarPicker
                  availableDates={availableDates}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onChange={onDateChange}
                  locale={locale}
                />
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="ev-dates__empty">No dates available.</p>
          ) : (
            <div className="ev-dates__list">
              {filtered.map(se => {
                const cal = fmtCalendar(se.dateIso)
                const sessionLabel = locale === 'fr' && se.session_fr
                  ? se.session_fr
                  : se.session
                const href = `/${slug}/${se.dateIso}`

                return (
                  <Link key={`${se.session || ''}__${se.dateIso}`} href={href} className="ev-date-row">
                    <div className="ev-date-row__cal">
                      <span className="ev-date-row__month">{cal.month}</span>
                      <span className="ev-date-row__day">{cal.day}</span>
                      <span className="ev-date-row__weekday">{cal.weekday}</span>
                    </div>
                    <div className="ev-date-row__info">
                      {sessionLabel && <p className="ev-date-row__session">{sessionLabel}</p>}
                      <p className="ev-date-row__venue">
                        {se.lieu ? `${se.lieu}, ` : ''}{se.ville}{se.pays ? `, ${se.pays}` : ''}
                      </p>
                    </div>
                    <div className="ev-date-row__right">
                      {se.prixFrom != null && (
                        <span className="ev-date-row__price">From &euro;{Math.round(se.prixFrom)}</span>
                      )}
                      <span className="ev-date-row__cta">See tickets &rarr;</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
          </>
          )}
        </div>
      </section>

      {/* Hidden crawlable schedule — server-rendered for SEO */}
      <div className="ev-sr-only" aria-hidden="true">
        <h2>{meta.evenement} Schedule</h2>
        <ul>
          {subEvents.map(se => {
            const d = new Date(se.dateIso)
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
            return (
              <li key={`${se.session || ''}__${se.dateIso}`}>
                {dateStr} — {se.session || meta.evenement} — {se.lieu ? `${se.lieu}, ` : ''}{se.ville}
              </li>
            )
          })}
        </ul>
      </div>

      {/* SEO text */}
      {seoText && (
        <section className="ev-seo">
          <h2 className="ev-seo__heading">About {meta.evenement} Tickets</h2>
          <div className="ev-seo__inner" dangerouslySetInnerHTML={{ __html: seoText }} />
        </section>
      )}

      <Footer />

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        /* ── Hero ─────────────────────────────────────────── */
        .ev-hero {
          position: relative;
          height: 400px;
          background: #0d0d0d;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
          margin-top: -64px;
          padding-top: 64px;
        }
        .ev-hero__bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ev-hero__overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.3) 0%,
            rgba(0,0,0,0.55) 60%,
            rgba(0,0,0,0.8) 100%
          );
        }
        .ev-hero__content {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          padding: 0 48px 48px;
        }
        .ev-hero__type {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          margin: 0 0 8px;
        }
        .ev-hero__name {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: clamp(36px, 5vw, 56px);
          font-weight: 500;
          color: white;
          margin: 0 0 10px;
          line-height: 1.1;
        }
        .ev-hero__meta {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 400;
          color: rgba(255,255,255,0.55);
          margin: 0;
        }

        /* ── Date list ────────────────────────────────────── */
        .ev-dates {
          background: #FAFAF8;
          padding: 48px 48px 64px;
        }
        .ev-dates__inner {
          max-width: 860px;
          margin: 0 auto;
        }
        .ev-dates__filters {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .ev-dates__select {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #111111;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          padding: 0.625rem 0.75rem;
          background: white;
          outline: none;
        }
        .ev-dates__select:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }
        .ev-dates__empty {
          text-align: center;
          color: #9ca3af;
          padding: 3rem 0;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .ev-dates__list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* ── Date row ─────────────────────────────────────── */
        .ev-date-row {
          display: flex;
          align-items: center;
          gap: 20px;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          padding: 16px 24px;
          text-decoration: none;
          color: #111111;
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .ev-date-row:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        .ev-date-row__cal {
          width: 56px;
          height: 64px;
          background: #1a3a2a;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          gap: 1px;
        }
        .ev-date-row__month {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.6);
          line-height: 1;
        }
        .ev-date-row__day {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 22px;
          font-weight: 700;
          color: white;
          line-height: 1.1;
        }
        .ev-date-row__weekday {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 10px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          line-height: 1;
          text-transform: capitalize;
        }
        .ev-date-row__info {
          flex: 1;
          min-width: 0;
        }
        .ev-date-row__session {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ev-date-row__venue {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: #6b7280;
          margin: 0;
        }
        .ev-date-row__right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex-shrink: 0;
        }
        .ev-date-row__price {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: #111111;
        }
        .ev-date-row__cta {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #1a3a2a;
        }

        /* ── Visually hidden (crawlable) ──────────────────── */
        .ev-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* ── SEO text ─────────────────────────────────────── */
        .ev-seo {
          background: #FAFAF8;
          padding: 0 48px 80px;
        }
        .ev-seo__heading {
          max-width: 780px;
          margin: 0 auto 0;
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: clamp(24px, 3vw, 32px);
          font-weight: 500;
          color: #111111;
          padding-bottom: 24px;
          border-bottom: 1px solid #E5E5E0;
        }
        .ev-seo__inner {
          max-width: 780px;
          margin: 0 auto;
          padding-top: 32px;
        }
        .ev-seo__inner p {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #111111;
          margin: 0 0 1.25rem;
        }
        .ev-seo__inner h3 {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 17px;
          font-weight: 600;
          color: #111111;
          margin: 2rem 0 0.5rem;
          line-height: 1.4;
        }
        .ev-seo__inner h3:first-child { margin-top: 0; }
        .ev-seo__inner ul {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #111111;
          margin: 0 0 1.25rem;
          padding-left: 1.5rem;
        }
        .ev-seo__inner li {
          margin-bottom: 0.25rem;
        }

        /* ── Sold-out / Waitlist ───────────────────────────── */
        .ev-soldout {
          text-align: center;
          padding: 48px 0;
        }
        .ev-soldout__badge {
          display: inline-block;
          background: #dc2626;
          color: white;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 6px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
        }
        .ev-soldout__text {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          color: #6b7280;
          margin: 0 0 24px;
        }
        .ev-soldout__form {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          max-width: 520px;
          margin: 0 auto;
        }
        .ev-soldout__input {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          padding: 10px 14px;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          outline: none;
          flex: 1;
          min-width: 200px;
          color: #111111;
        }
        .ev-soldout__input:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }
        .ev-soldout__btn {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 500;
          padding: 10px 20px;
          background: #1a3a2a;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          white-space: nowrap;
        }
        .ev-soldout__btn:hover { background: #15302a; }
        .ev-soldout__btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ev-soldout__success {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          color: #059669;
          margin: 0;
        }

        /* ── Mobile ───────────────────────────────────────── */
        @media (max-width: 640px) {
          .ev-hero { height: 320px; }
          .ev-hero__content { padding: 0 20px 32px; }
          .ev-dates { padding: 32px 20px 48px; }
          .ev-date-row { padding: 12px 16px; gap: 14px; }
          .ev-date-row__cal { width: 48px; height: 56px; }
          .ev-date-row__day { font-size: 18px; }
          .ev-seo { padding: 0 20px 60px; }
        }
      `}</style>
    </>
  )
}
