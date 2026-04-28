import { requireStaff } from '@/lib/auth/guards';
import Sidebar from '@/components/Sidebar';
import InactivityBanner from '@/components/InactivityBanner';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-h-screen">
        <InactivityBanner />
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-slate-500">Signed in as <b>{user.fullName}</b> · {user.role}</div>
          <form action="/api/auth/signout" method="post">
            <button className="btn-secondary text-xs">Sign out</button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
