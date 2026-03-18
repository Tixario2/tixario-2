// pages/dashboard/login.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Restore "remember me" preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('zenntry_remember_me')
      if (stored === 'true') setRememberMe(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.session) {
      setError(authError?.message ?? 'Login failed')
      setLoading(false)
      return
    }

    // Persist remember-me preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('zenntry_remember_me', String(rememberMe))
    }

    console.log(`[login] rememberMe=${rememberMe}, setting HttpOnly cookies via API`)

    // Store tokens in HttpOnly cookies via API route
    const cookieResp = await fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        remember_me: rememberMe,
      }),
    })
    if (!cookieResp.ok) {
      setError('Failed to set session cookies')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black tracking-tight">ZENNTRY</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="peer sr-only"
              />
              <span className="w-4 h-4 rounded border border-gray-300 peer-checked:bg-[#1a3a2a] peer-checked:border-[#1a3a2a] transition-colors flex items-center justify-center">
                {rememberMe && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </span>
            <span className="text-sm text-[#111111]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Remember me
            </span>
          </label>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1a3a2a] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#143020] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
