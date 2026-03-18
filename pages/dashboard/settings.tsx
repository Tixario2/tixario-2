// pages/dashboard/settings.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'

interface SettingRow {
  key: string
  value: string
  updated_at: string | null
}

interface Props {
  userName: string | null
  settings: SettingRow[]
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data: settings } = await supabaseServer
    .from('settings')
    .select('key, value, updated_at')
    .in('key', ['ingest_active_adrien', 'ingest_active_archie'])

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      settings: settings ?? [],
    },
  }
}

function IngestToggle({
  label,
  settingKey,
  initialValue,
  updatedAt,
}: {
  label: string
  settingKey: string
  initialValue: boolean
  updatedAt: string | null
}) {
  const [active, setActive] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(updatedAt)

  const toggle = async () => {
    const newValue = !active
    setSaving(true)
    const res = await fetch('/api/dashboard/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, value: String(newValue) }),
    })
    if (res.ok) {
      setActive(newValue)
      setLastUpdated(new Date().toISOString())
    }
    setSaving(false)
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="flex items-center justify-between py-5 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-black">{label}</p>
        {active ? (
          <p className="text-xs text-green-600 mt-1">Ingest active &mdash; emails will be processed</p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">Ingest paused</p>
        )}
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-0.5">Last updated: {formatTime(lastUpdated)}</p>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`relative w-14 h-8 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a3a2a] disabled:opacity-50 ${
          active ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
            active ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingsPage({ userName, settings }: Props) {
  const getVal = (key: string) => {
    const s = settings.find(s => s.key === key)
    return { value: s?.value === 'true', updatedAt: s?.updated_at ?? null }
  }

  const adrien = getVal('ingest_active_adrien')
  const archie = getVal('ingest_active_archie')

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Settings</h1>

        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-black mb-4">Email Ingest</h2>
          <p className="text-xs text-gray-500 mb-4">
            When active, forwarded ticket confirmation emails will be automatically parsed and added to drafts.
          </p>

          <IngestToggle
            label="Adrien &mdash; email ingest active"
            settingKey="ingest_active_adrien"
            initialValue={adrien.value}
            updatedAt={adrien.updatedAt}
          />
          <IngestToggle
            label="Archie &mdash; email ingest active"
            settingKey="ingest_active_archie"
            initialValue={archie.value}
            updatedAt={archie.updatedAt}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
