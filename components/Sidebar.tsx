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
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            RA
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-tight">Rashed Ali Co.</div>
            <div className="text-xs text-slate-400">Management Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Menu</p>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-600 font-medium
                       hover:bg-brand-50 hover:text-brand-700 transition-all duration-150"
          >
            <Icon className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-brand-600 transition-colors" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">© {new Date().getFullYear()} Rashed Ali Cafeteria</p>
      </div>
    </aside>
  );
}
