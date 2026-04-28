import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guards';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (['super_admin', 'admin', 'accountant'].includes(user.role)) redirect('/admin/dashboard');
  redirect('/portfolio');
}
