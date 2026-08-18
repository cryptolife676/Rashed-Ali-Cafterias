import Link from 'next/link';
import { LayoutDashboard, Receipt, Users, BadgeDollarSign, FileText, ScrollText } from 'lucide-react';

const items = [
  { href: '/admin/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/admin/transactions',  label: 'Transactions',  icon: Receipt },
  { href: '/admin/shareholders',  label: 'Shareholders',  icon: Users },
  { href: '/admin/distributions', label: 'Distributions', icon: BadgeDollarSign },
  { href: '/admin/reports',       label: 'Reports',       icon: FileText },
  { href: '/admin/audit-logs',    label: 'Audit Logs',    icon: ScrollText },
];

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 min-h-screen flex flex-col" style={{ background: '#0c0b09' }}>

      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(201,162,39,0.15)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #c9a227, #e8c96a)', color: '#0c0b09' }}
          >
            RA
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">RASHED ALI</div>
            <div className="text-[10px] tracking-widest font-medium" style={{ color: '#c9a227' }}>
              MANAGEMENT
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        <p className="px-3 mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(201,162,39,0.5)' }}>
          Navigation
        </p>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-white/55 hover:bg-[rgba(201,162,39,0.1)] hover:text-[#c9a227]"
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t" style={{ borderColor: 'rgba(201,162,39,0.1)' }}>
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          © {new Date().getFullYear()} Rashed Ali Co.
        </p>
      </div>
    </aside>
  );
}
