// components/Footer.tsx
import Link from 'next/link'
import { useTranslation } from 'next-i18next'

export default function Footer() {
  const { t } = useTranslation('common')

  return (
    <>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <span className="site-footer__wordmark">ZENNTRY</span>
            <p className="site-footer__tagline">{t('home.footer_tagline')}</p>
          </div>
          <nav className="site-footer__links">
            <Link href="/concerts" className="site-footer__link">{t('nav.concerts')}</Link>
            <Link href="/sports" className="site-footer__link">{t('nav.sports')}</Link>
            <Link href="/contact" className="site-footer__link">{t('nav.contact')}</Link>
            <a href="https://wa.me/33768618504" target="_blank" rel="noopener noreferrer" className="site-footer__link">WhatsApp</a>
            <a href="https://t.me/zenntryPTC" target="_blank" rel="noopener noreferrer" className="site-footer__link">Telegram</a>
            <a href="https://instagram.com/zenntry.ww" target="_blank" rel="noopener noreferrer" className="site-footer__link">Instagram</a>
          </nav>
          <div className="site-footer__bottom">
            <p className="site-footer__copy">&copy; {new Date().getFullYear()} Zenntry. Tous droits r&eacute;serv&eacute;s.</p>
          </div>
        </div>
      </footer>

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx global>{`
        .site-footer {
          background: #111;
          padding: 3.5rem 1.5rem 2.5rem;
        }
        .site-footer__inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          text-align: center;
        }
        .site-footer__wordmark {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: white;
          display: block;
        }
        .site-footer__tagline {
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.35);
          margin: 0.375rem 0 0;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .site-footer__links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 1.75rem;
        }
        .site-footer__link {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.45);
          text-decoration: none;
          font-family: 'Inter', system-ui, sans-serif;
          transition: color 0.15s;
        }
        .site-footer__link:hover { color: white; }
        .site-footer__bottom {
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 1.5rem;
          width: 100%;
        }
        .site-footer__copy {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.18);
          margin: 0;
          font-family: 'Inter', system-ui, sans-serif;
        }
      `}</style>
    </>
  )
}
