'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';

/**
 * Admin chrome. The nav is a fixed rail from `lg` up and a slide-in drawer
 * below it — a permanently visible 16rem rail leaves almost nothing for
 * content on a phone.
 *
 * `banner` and `children` are server-rendered and passed through as slots,
 * so making the chrome interactive does not drag the pages into the client
 * bundle.
 */
export default function AdminShell({
  user,
  banner,
  children,
}: {
  user: { fullName: string; role: string };
  banner: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation — otherwise the drawer stays over the new page.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Escape to close, and stop the page behind from scrolling while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:flex">
      {/* Desktop rail */}
      <aside className="hidden lg:block w-64 shrink-0 min-h-screen">
        <div className="fixed inset-y-0 left-0 w-64">
          <Sidebar role={user.role} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close navigation"
          tabIndex={open ? 0 : -1}
          className="absolute inset-0 bg-black/50 w-full"
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transition-transform duration-200 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar role={user.role} onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {/* min-w-0 lets wide tables scroll inside the column instead of
          stretching the whole page sideways. */}
      <div className="flex-1 min-w-0 min-h-screen">
        {banner}

        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            className="lg:hidden -ml-1 p-2 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="min-w-0 flex-1 text-sm text-slate-500 truncate">
            <span className="hidden sm:inline">Signed in as </span>
            <b className="text-slate-700">{user.fullName}</b>
            <span className="hidden sm:inline"> · {user.role}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href="/account" className="btn-secondary text-xs whitespace-nowrap">
              <span className="hidden sm:inline">My account</span>
              <span className="sm:hidden">Account</span>
            </Link>
            <form action="/api/auth/signout" method="post">
              <button className="btn-secondary text-xs whitespace-nowrap">
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden">Out</span>
              </button>
            </form>
          </div>
        </header>

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
