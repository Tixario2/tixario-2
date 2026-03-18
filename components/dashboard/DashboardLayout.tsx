// components/dashboard/DashboardLayout.tsx
import Link from 'next/link'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import {
  LayoutDashboard,
  ShoppingBag,
  PackageCheck,
  Boxes,
  CreditCard,
  LogOut,
  MessageSquare,
  PlusCircle,
  Pencil,
  ListPlus,
  CalendarDays,
  FileText,
  Settings,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard',              icon: LayoutDashboard },
  { label: 'Orders',       href: '/dashboard/orders',       icon: ShoppingBag },
  { label: 'Fulfillment',  href: '/dashboard/fulfillment',  icon: PackageCheck },
  { label: 'Events',       href: '/dashboard/events',       icon: CalendarDays },
  { label: 'Drafts',       href: '/dashboard/drafts',       icon: FileText },
  { label: 'Demandes',     href: '/dashboard/demandes',     icon: MessageSquare },
  { label: 'Inventory',    href: '/dashboard/inventory',    icon: Boxes },
  { label: 'Purchases',    href: '/dashboard/purchases',    icon: CreditCard },
  { label: 'Settings',     href: '/dashboard/settings',     icon: Settings },
  { label: 'Add Event',    href: '/admin/new-event',        icon: PlusCircle },
  { label: 'Edit Event',   href: '/admin/edit-event',       icon: Pencil },
  { label: 'Add Listings', href: '/admin/add-listings',     icon: ListPlus },
]

interface Props {
  children: React.ReactNode
  userName?: string | null
}

export default function DashboardLayout({ children, userName }: Props) {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Clear HttpOnly cookies via API route
    await fetch('/api/auth/clear-session', { method: 'POST' })
    router.push('/dashboard/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-200">
          <span className="text-lg font-bold tracking-widest text-[#1a3a2a]">ZENNTRY</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = router.pathname === href || (href !== '/dashboard' && router.pathname.startsWith(href + '/'))
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#1a3a2a] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User + logout */}
        <div className="px-4 py-4 border-t border-gray-200">
          {userName && (
            <p className="text-xs text-gray-500 mb-2 truncate">{userName}</p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
