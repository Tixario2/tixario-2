// pages/dashboard/demandes.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'
import { format } from 'date-fns'

interface Demande {
  id: number
  created_at: string
  evenement: string
  date_evenement: string | null
  nb_billets: number
  categorie_preferee: string | null
  budget: string | null
  canal_contact: 'whatsapp' | 'telegram'
  telephone: string
  notes_client: string | null
  statut: 'received' | 'quote_sent' | 'paid' | 'tickets_sent'
  notes_internes: string | null
}

interface Props {
  userName: string | null
  demandes: Demande[]
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data: demandes } = await supabaseServer
    .from('demandes')
    .select('*')
    .order('created_at', { ascending: false })

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      demandes: demandes ?? [],
    },
  }
}

const STATUT_OPTIONS = ['received', 'quote_sent', 'paid', 'tickets_sent'] as const

function statutBadge(s: string) {
  const map: Record<string, string> = {
    received:     'bg-gray-100 text-gray-600',
    quote_sent:   'bg-blue-100 text-blue-700',
    paid:         'bg-green-100 text-green-700',
    tickets_sent: 'bg-[#1a3a2a] text-white',
  }
  const label: Record<string, string> = {
    received:     'Reçue',
    quote_sent:   'Devis envoyé',
    paid:         'Payée',
    tickets_sent: 'Billets envoyés',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] ?? 'bg-gray-100 text-gray-600'}`}>
      {label[s] ?? s}
    </span>
  )
}

function ContactIcon({ canal }: { canal: string }) {
  if (canal === 'whatsapp') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" className="flex-shrink-0">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#0088cc" className="flex-shrink-0">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  )
}

function DemandeRow({ demande }: { demande: Demande }) {
  const [statut, setStatut] = useState(demande.statut)
  const [notes, setNotes] = useState(demande.notes_internes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [saving, setSaving] = useState(false)

  const patch = async (payload: { statut?: string; notes_internes?: string }) => {
    setSaving(true)
    await fetch(`/api/demandes/${demande.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
  }

  const handleStatutChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setStatut(val as Demande['statut'])
    await patch({ statut: val })
  }

  const handleNotesSave = async () => {
    setEditingNotes(false)
    await patch({ notes_internes: notes })
  }

  const truncate = (text: string | null, max = 60) => {
    if (!text) return '—'
    return text.length > max ? text.slice(0, max) + '…' : text
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top">
      {/* Date */}
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
        {format(new Date(demande.created_at), 'dd/MM/yyyy HH:mm')}
      </td>

      {/* Événement */}
      <td className="px-4 py-3">
        <p className="font-medium text-black text-sm">{demande.evenement}</p>
        {demande.date_evenement && (
          <p className="text-xs text-gray-400 mt-0.5">{demande.date_evenement}</p>
        )}
        {demande.categorie_preferee && (
          <p className="text-xs text-gray-400">{demande.categorie_preferee}</p>
        )}
      </td>

      {/* Billets */}
      <td className="px-4 py-3 text-sm text-gray-700 text-center">
        {demande.nb_billets}
      </td>

      {/* Budget */}
      <td className="px-4 py-3 text-sm text-gray-700">
        {demande.budget ?? '—'}
      </td>

      {/* Contact */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <ContactIcon canal={demande.canal_contact} />
          <span className="text-sm text-gray-700">{demande.telephone}</span>
        </div>
      </td>

      {/* Message */}
      <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px]">
        {truncate(demande.notes_client)}
      </td>

      {/* Statut */}
      <td className="px-4 py-3">
        {statutBadge(statut)}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 min-w-[220px]">
        <div className="flex flex-col gap-2">
          {/* Status dropdown */}
          <select
            value={statut}
            onChange={handleStatutChange}
            disabled={saving}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1a3a2a] disabled:opacity-50"
          >
            {STATUT_OPTIONS.map(s => (
              <option key={s} value={s}>
                {{ received: 'Reçue', quote_sent: 'Devis envoyé', paid: 'Payée', tickets_sent: 'Billets envoyés' }[s]}
              </option>
            ))}
          </select>

          {/* Notes internes */}
          {editingNotes ? (
            <textarea
              autoFocus
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesSave}
              rows={3}
              className="text-xs px-2 py-1.5 border border-[#1a3a2a] rounded-md bg-white text-gray-700 focus:outline-none resize-none w-full"
              placeholder="Notes internes…"
            />
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-left text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-500 hover:border-[#1a3a2a] hover:text-black transition-colors w-full"
            >
              {notes ? truncate(notes, 50) : <span className="text-gray-300">Notes internes…</span>}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

const TABS: { key: string | null; label: string }[] = [
  { key: null,           label: 'Toutes' },
  { key: 'received',     label: 'Reçues' },
  { key: 'quote_sent',   label: 'Devis envoyé' },
  { key: 'paid',         label: 'Payées' },
  { key: 'tickets_sent', label: 'Billets envoyés' },
]

export default function DemandesPage({ userName, demandes }: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null)

  const filtered = activeTab === null
    ? demandes
    : demandes.filter(d => d.statut === activeTab)

  const countFor = (key: string | null) =>
    key === null ? demandes.length : demandes.filter(d => d.statut === key).length

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-black">Demandes clients</h1>
            <p className="text-sm text-gray-500 mt-0.5">{filtered.length} demande{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map(tab => {
            const active = activeTab === tab.key
            const count = countFor(tab.key)
            return (
              <button
                key={String(tab.key)}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#1a3a2a] text-white'
                    : 'bg-white text-[#111111] border border-[#E5E5E0] hover:border-[#1a3a2a]'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${active ? 'text-white/70' : 'text-gray-400'}`}>
                  ({count})
                </span>
              </button>
            )
          })}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Événement</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Billets</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Message</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                      Aucune demande pour l&rsquo;instant.
                    </td>
                  </tr>
                ) : (
                  filtered.map(d => <DemandeRow key={d.id} demande={d} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
