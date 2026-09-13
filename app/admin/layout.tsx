import { requireStaff } from '@/lib/auth/guards';
import AdminShell from '@/components/AdminShell';
import InactivityBanner from '@/components/InactivityBanner';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <AdminShell
      user={{ fullName: user.fullName, role: user.role }}
      banner={<InactivityBanner />}
    >
      {children}
    </AdminShell>
  );
}
