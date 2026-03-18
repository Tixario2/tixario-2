// pages/concerts/index.tsx
import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import EventCard from '@/components/EventCard'
import { supabase } from '@/supabaseClient'
import { buildEventData, FeaturedEvent } from '@/lib/eventUtils'

interface ConcertsProps {
  featured: FeaturedEvent[]
}

export const getServerSideProps: GetServerSideProps<ConcertsProps> = async ({ locale }) => {
  const { data: rows } = await supabase
    .from('billets')
    .select('evenement, slug, date, ville, pays, categorie, prix, image, logo_artiste, type')
    .eq('type', 'concert')
    .order('date', { ascending: true })

  const { data: hiddenMeta } = await supabase
    .from('event_meta')
    .select('slug')
    .or('paused.eq.true,archived.eq.true')
  const hiddenSlugs = new Set((hiddenMeta ?? []).map(m => m.slug))
  const visibleRows = (rows ?? []).filter(r => !hiddenSlugs.has(r.slug))

  const { featured } = buildEventData(visibleRows)

  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'fr', ['common'])),
      featured,
    },
  }
}

export default function ConcertsPage({ featured }: ConcertsProps) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const locale = router.locale ?? 'fr'

  return (
    <>
      <Head>
        <title>Concerts - Zenntry</title>
        <meta name="description" content="Premium concert tickets" />
      </Head>

      <Header />

      <main className="cp-main">
        <div className="cp-inner">
          <h1 className="cp-title">Concerts</h1>
          {featured.length === 0 ? (
            <p className="cp-empty">No concerts available at the moment.</p>
          ) : (
            <div className="cp-grid">
              {featured.map(ev => (
                <EventCard key={ev.slugEvent} event={ev} locale={locale} t={t} />
              ))}
            </div>
          )}
        </div>
      </main>

      <section className="cp-seo">
        <div className="cp-seo__inner">
          <h2 className="cp-seo__h2">About Concert Tickets</h2>
          <p className="cp-seo__p">
            Live music creates moments that stay with you long after the final song. The atmosphere of a packed arena, the anticipation before an artist takes the stage, the shared energy between thousands of fans — concerts are one of the most powerful live experiences there is.
          </p>
          <p className="cp-seo__p">
            From stadium tours and arena shows to intimate performances and major festivals, concerts bring audiences closer to the artists they love. Whether it&apos;s a global superstar on a sold-out tour or a rising act playing a smaller room, every show has its own atmosphere.
          </p>
          <p className="cp-seo__p">
            Zenntry provides access to concert tickets for major tours, festivals and live music events across Europe and beyond. Many tickets are listed directly on the site and can be purchased instantly, with new inventory added continuously as we expand our supply.
          </p>
          <p className="cp-seo__p">
            If the concert or seats you&apos;re looking for aren&apos;t currently listed, submit a request and our team will source available options through our partner network.
          </p>

          <h2 className="cp-seo__h2">Find concert tickets across all genres</h2>
          <p className="cp-seo__p">
            Zenntry covers live music events across a wide range of genres and venues. From stadium tours to festivals and smaller venue shows, here&apos;s what you can typically find:
          </p>
          <ul className="cp-seo__ul">
            <li><strong>Pop &amp; global tours:</strong> Major stadium and arena tours from artists like Taylor Swift, Billie Eilish and Beyonc&eacute;</li>
            <li><strong>Hip-hop &amp; rap:</strong> Drake, Travis Scott, Kendrick Lamar and more</li>
            <li><strong>Rock &amp; alternative:</strong> Legendary bands and modern acts including The Rolling Stones and Bruce Springsteen</li>
            <li><strong>Latin music:</strong> Bad Bunny, Karol G, Maluma and other international artists</li>
            <li><strong>R&amp;B and soul:</strong> SZA, Usher, Alicia Keys and similar artists</li>
            <li><strong>Major festivals:</strong> Tomorrowland, Hellfest and other large-scale events</li>
          </ul>
          <p className="cp-seo__p">
            Whether you&apos;re after front-row seats, VIP hospitality or tickets to a sold-out tour, Zenntry helps you get there.
          </p>

          <h2 className="cp-seo__h2">Tickets available directly through Zenntry</h2>
          <p className="cp-seo__p">
            Many concert tickets are available for instant purchase on the site. Inventory is added regularly as we expand our event coverage, so fans can browse upcoming concerts, explore seating options and check out quickly.
          </p>
          <p className="cp-seo__p">
            For concerts where availability is limited or not yet listed, you can submit a sourcing request and our team will search our partner network for available options.
          </p>
          <p className="cp-seo__p">
            Can&apos;t find what you&apos;re looking for? Submit a request here:{' '}
            <Link href="/en/request" className="cp-seo__link">Make a request</Link>
          </p>

          <h2 className="cp-seo__h2">Finding the right seats</h2>
          <p className="cp-seo__p">
            The right seat shapes the whole experience. Some fans want the energy of the floor close to the stage, others prefer a wider view from a seated section. Depending on the venue, options typically include floor and pit sections, lower bowl seating, balcony or upper-level areas, and VIP or hospitality packages. If the section you want isn&apos;t listed, submit a request and our team will look into availability.
          </p>

          <h2 className="cp-seo__h2">How to find the best availability</h2>
          <p className="cp-seo__p">
            Availability for major concerts moves fast, especially for high-demand tours and festival events. A few things that help:
          </p>
          <ul className="cp-seo__ul">
            <li>Plan early for major tours and festivals</li>
            <li>Check different seating sections</li>
            <li>Use the sourcing request if tickets aren&apos;t listed yet</li>
            <li>Enable email notifications to be alerted when availability or prices change</li>
          </ul>

          <h2 className="cp-seo__h2">Ticket delivery</h2>
          <p className="cp-seo__p">
            Most concert tickets are delivered digitally through secure transfer systems used by venues, promoters and official ticketing platforms. Depending on the event, tickets arrive via the official ticketing provider, a mobile ticketing app or another secure digital system. Delivery instructions are sent after purchase so you can access your tickets easily before the show.
          </p>
        </div>
      </section>

      <Footer />

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        .cp-main {
          background: #FAFAF8;
          min-height: calc(100vh - 64px);
          padding: 3.5rem 1.5rem 5rem;
        }
        .cp-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .cp-title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 48px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 2.5rem;
        }
        .cp-empty {
          text-align: center;
          color: #6b7280;
          padding: 3rem 0;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9375rem;
        }
        .cp-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 900px) {
          .cp-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 580px) {
          .cp-grid { grid-template-columns: 1fr; }
          .cp-title { font-size: 36px; }
        }

        /* ── SEO block ─────────────────────────────────────── */
        .cp-seo {
          background: #FAFAF8;
          padding: 80px 40px;
        }
        .cp-seo__inner {
          max-width: 900px;
          margin: 0 auto;
        }
        .cp-seo__h2 {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          color: #111111;
          margin: 2.5rem 0 1rem;
        }
        .cp-seo__h2:first-child {
          margin-top: 0;
        }
        .cp-seo__p {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #111111;
          margin: 0 0 1rem;
        }
        .cp-seo__ul {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #111111;
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .cp-seo__ul li {
          margin-bottom: 0.25rem;
        }
        .cp-seo__link {
          color: #1a3a2a;
          font-weight: 500;
          text-decoration: none;
        }
        .cp-seo__link:hover {
          text-decoration: underline;
        }
        @media (max-width: 580px) {
          .cp-seo { padding: 60px 1.5rem; }
        }
      `}</style>
    </>
  )
}
