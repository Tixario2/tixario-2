// pages/request.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'fr', ['common'])),
    },
  }
}

const inputClass =
  'w-full px-4 py-3 bg-white border border-[#E5E5E0] rounded-md text-sm text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] transition'

export default function RequestPage() {
  const { t } = useTranslation('common')

  const [form, setForm] = useState({
    evenement: '',
    date_evenement: '',
    nb_billets: '1',
    categorie_preferee: '',
    budget: '',
    canal_contact: 'whatsapp',
    telephone: '',
    notes_client: '',
  })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (data?.success) {
      setSubmitted(true)
    } else {
      setError(data?.error ?? 'Une erreur est survenue.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-16">
        {submitted ? (
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-10 text-center shadow-sm">
            {/* Success icon */}
            <div className="w-14 h-14 bg-[#1a3a2a] rounded-full flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2
              className="text-3xl font-semibold text-[#111111] mb-3"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              {t('request.success_title')}
            </h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              {t('request.success_body')}
            </p>

            <p className="text-sm text-gray-400 mb-4">{t('request.contact_us')}</p>
            <div className="flex flex-col gap-3">
              <a
                href="https://wa.me/33768618504"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 px-6 py-3 bg-[#1a3a2a] text-white rounded-md font-medium text-sm hover:bg-[#15302a] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
              <a
                href="https://t.me/zenntryPTC"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 px-6 py-3 bg-[#1a3a2a] text-white rounded-md font-medium text-sm hover:bg-[#15302a] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                Telegram
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Page header */}
            <div className="mb-10">
              <h1
                className="text-4xl font-semibold text-[#111111] mb-3"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
              >
                {t('request.title')}
              </h1>
              <p className="text-gray-500 leading-relaxed">
                {t('request.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white border border-[#E5E5E0] rounded-xl p-8 shadow-sm space-y-6">

              {/* Event name */}
              <div>
                <label className="block text-sm font-medium text-[#111111] mb-1.5">
                  {t('request.field_event')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.evenement}
                  onChange={e => set('evenement', e.target.value)}
                  className={inputClass}
                  placeholder="ex : Taylor Swift, Roland Garros…"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-[#111111] mb-1.5">
                  {t('request.field_date')}
                </label>
                <input
                  type="text"
                  value={form.date_evenement}
                  onChange={e => set('date_evenement', e.target.value)}
                  className={inputClass}
                  placeholder={t('request.field_date_placeholder')}
                />
              </div>

              {/* Tickets + Category (2 columns) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#111111] mb-1.5">
                    {t('request.field_tickets')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={form.nb_billets}
                    onChange={e => set('nb_billets', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#111111] mb-1.5">
                    {t('request.field_category')}
                  </label>
                  <input
                    type="text"
                    value={form.categorie_preferee}
                    onChange={e => set('categorie_preferee', e.target.value)}
                    className={inputClass}
                    placeholder={t('request.field_category_placeholder')}
                  />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-sm font-medium text-[#111111] mb-1.5">
                  {t('request.field_budget')}
                </label>
                <input
                  type="text"
                  value={form.budget}
                  onChange={e => set('budget', e.target.value)}
                  className={inputClass}
                  placeholder={t('request.field_budget_placeholder')}
                />
              </div>

              {/* Contact channel */}
              <div>
                <label className="block text-sm font-medium text-[#111111] mb-3">
                  {t('request.field_contact')} <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-4">
                  {(['whatsapp', 'telegram'] as const).map(ch => (
                    <label
                      key={ch}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border rounded-md cursor-pointer text-sm font-medium transition-colors ${
                        form.canal_contact === ch
                          ? 'bg-[#1a3a2a] border-[#1a3a2a] text-white'
                          : 'bg-white border-[#E5E5E0] text-[#111111] hover:border-[#1a3a2a]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="canal_contact"
                        value={ch}
                        checked={form.canal_contact === ch}
                        onChange={() => set('canal_contact', ch)}
                        className="sr-only"
                      />
                      {ch === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-sm font-medium text-[#111111] mb-1.5">
                  {t('request.field_phone')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.telephone}
                  onChange={e => set('telephone', e.target.value)}
                  className={inputClass}
                  placeholder="+33 6 00 00 00 00"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-[#111111] mb-1.5">
                  {t('request.field_notes')}
                </label>
                <textarea
                  rows={4}
                  value={form.notes_client}
                  onChange={e => set('notes_client', e.target.value)}
                  className={inputClass + ' resize-none'}
                  placeholder={t('request.field_notes_placeholder')}
                />
              </div>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1a3a2a] hover:bg-[#15302a] text-white py-3.5 rounded-md font-medium text-sm transition-colors disabled:opacity-60"
              >
                {loading ? '…' : t('request.submit')}
              </button>
            </form>
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
