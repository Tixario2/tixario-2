// pages/sports/index.tsx
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

interface SportsProps {
  featured: FeaturedEvent[]
}

export const getServerSideProps: GetServerSideProps<SportsProps> = async ({ locale }) => {
  const { data: rows } = await supabase
    .from('billets')
    .select('evenement, slug, date, ville, pays, categorie, prix, image, logo_artiste, type')
    .eq('type', 'sport')
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

export default function SportsPage({ featured }: SportsProps) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const locale = router.locale ?? 'fr'

  return (
    <>
      <Head>
        <title>Sports - Zenntry</title>
        <meta name="description" content="Premium sports tickets" />
      </Head>

      <Header />

      <main className="sp-main">
        <div className="sp-inner">
          <h1 className="sp-title">Sports</h1>
          {featured.length === 0 ? (
            <p className="sp-empty">No sports events available at the moment.</p>
          ) : (
            <div className="sp-grid">
              {featured.map(ev => (
                <EventCard key={ev.slugEvent} event={ev} locale={locale} t={t} />
              ))}
            </div>
          )}
        </div>
      </main>

      <section className="sp-seo">
        <div className="sp-seo__inner">
          <h2 className="sp-seo__h2">Popular sports events available on Zenntry</h2>
          <p className="sp-seo__p">
            Zenntry covers a wide range of sporting events worldwide, with strong coverage across European football, major international tournaments, tennis, rugby and combat sports. Tickets can be purchased directly on the site, and if a specific match or seat isn&apos;t listed, our sourcing team can locate inventory through our global partner network.
          </p>
          <p className="sp-seo__p">Popular sports events include:</p>
          <ul className="sp-seo__ul">
            <li><strong>Rugby:</strong> Major international tournaments including the Rugby World Cup</li>
            <li><strong>European football:</strong> Club matches across domestic leagues and international competitions, including all UEFA Champions League games and the final</li>
            <li><strong>Tennis:</strong> Grand Slam tournaments such as Roland&#8209;Garros</li>
            <li><strong>Combat sports:</strong> Major fights from the UFC, international MMA promotions and boxing title bouts</li>
            <li><strong>Global football events:</strong> Matches involving the world&apos;s biggest clubs and national teams across European competitions</li>
            <li><strong>Other major sports:</strong> Selected events from the NFL, NBA and additional international competitions</li>
          </ul>
          <p className="sp-seo__p">
            From regular-season matches to finals and championship events, Zenntry helps fans attend the sporting moments that matter.
          </p>

          <h2 className="sp-seo__h2">Tickets available directly on Zenntry</h2>
          <p className="sp-seo__p">
            Many tickets are listed directly on the site and can be purchased instantly. Our inventory grows as we onboard additional sellers and partners, making it easier to browse events, compare seating options and check out in a few steps.
          </p>
          <p className="sp-seo__p">
            For events with limited availability or specific seating requirements, you can submit a sourcing request and our team will search across multiple suppliers to find the best available options.
          </p>
          <p className="sp-seo__p">
            If you can&apos;t find what you&apos;re looking for, submit a request here:{' '}
            <Link href="/en/request" className="sp-seo__link">Make a request</Link>
          </p>

          <h2 className="sp-seo__h2">Finding the right seats</h2>
          <p className="sp-seo__p">
            The right seat makes a real difference to the live experience. On Zenntry, you can browse available sections and select what fits your preferences and budget. For hospitality seating, courtside or premium areas with limited availability, a sourcing request is the best route — our team will locate options through our partner network.
          </p>

          <h2 className="sp-seo__h2">How to find the best availability</h2>
          <p className="sp-seo__p">
            Availability for major events moves fast, especially for high-demand matches and finals. A few things that help:
          </p>
          <ul className="sp-seo__ul">
            <li>Plan early for major tournaments and finals</li>
            <li>Check multiple seating sections</li>
            <li>Use the sourcing request if the seats you want aren&apos;t listed</li>
            <li>Enable email notifications to be alerted when availability or prices change</li>
          </ul>

          <h2 className="sp-seo__h2">Ticket delivery</h2>
          <p className="sp-seo__p">
            Most sports tickets are delivered digitally via secure transfer systems used by teams, leagues and venues. Depending on the event, tickets are transferred through the official ticketing platform or via secure mobile ticketing. Delivery instructions are sent after purchase so you can access your tickets without hassle before the event.
          </p>
        </div>
      </section>

      <Footer />

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        .sp-main {
          background: #FAFAF8;
          min-height: calc(100vh - 64px);
          padding: 3.5rem 1.5rem 5rem;
        }
        .sp-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .sp-title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 48px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 2.5rem;
        }
        .sp-empty {
          text-align: center;
          color: #6b7280;
          padding: 3rem 0;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.9375rem;
        }
        .sp-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 900px) {
          .sp-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 580px) {
          .sp-grid { grid-template-columns: 1fr; }
          .sp-title { font-size: 36px; }
        }

        /* ── SEO block ─────────────────────────────────────── */
        .sp-seo {
          background: #FAFAF8;
          padding: 80px 40px;
        }
        .sp-seo__inner {
          max-width: 900px;
          margin: 0 auto;
        }
        .sp-seo__h2 {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          color: #111111;
          margin: 2.5rem 0 1rem;
        }
        .sp-seo__h2:first-child {
          margin-top: 0;
        }
        .sp-seo__p {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #111111;
          margin: 0 0 1rem;
        }
        .sp-seo__ul {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #111111;
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .sp-seo__ul li {
          margin-bottom: 0.25rem;
        }
        .sp-seo__link {
          color: #1a3a2a;
          font-weight: 500;
          text-decoration: none;
        }
        .sp-seo__link:hover {
          text-decoration: underline;
        }
        @media (max-width: 580px) {
          .sp-seo { padding: 60px 1.5rem; }
        }
      `}</style>
    </>
  )
}
