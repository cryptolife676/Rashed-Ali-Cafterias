import Link from 'next/link';
import { LayoutDashboard, Receipt, Users, BadgeDollarSign, FileText, ScrollText } from 'lucide-react';

const items = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/shareholders', label: 'Shareholders', icon: Users },
  { href: '/admin/distributions', label: 'Distributions', icon: BadgeDollarSign },
  { href: '/admin/reports', label: 'Reports', icon: FileText },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-white border-r border-slate-200 min-h-screen p-4">
      <div className="text-lg font-semibold mb-6 px-2">Cafeteria HQ</div>
      <nav className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
