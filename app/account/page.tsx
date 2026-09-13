import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { accountHasPassword } from '@/server/actions/account';
import ChangePasswordForm from './ChangePasswordForm';

export const dynamic = 'force-dynamic';

const STAFF = ['super_admin', 'admin', 'accountant'];

export default async function AccountPage() {
  const user = await requireUser();
  const hasPassword = await accountHasPassword();
  const backHref = STAFF.includes(user.role) ? '/admin/dashboard' : '/portfolio';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Signed in as <b>{user.fullName}</b> · {user.role}
        </div>
        <div className="flex items-center gap-3">
          <Link href={backHref} className="btn-secondary text-xs">Back</Link>
          <form action="/api/auth/signout" method="post">
            <button className="btn-secondary text-xs">Sign out</button>
          </form>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Your account</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user.email ?? 'No email address on file'}
          </p>
        </div>

        <ChangePasswordForm hasPassword={hasPassword} />
      </main>
    </div>
  );
}
