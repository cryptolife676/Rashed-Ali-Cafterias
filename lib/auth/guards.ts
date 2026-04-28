import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type AuthedUser = {
  id: string;
  email: string | null;
  fullName: string;
  role: 'super_admin' | 'admin' | 'accountant' | 'shareholder' | 'viewer';
  isActive: boolean;
};

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
  };
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u || !u.isActive) redirect('/login');
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (!['super_admin', 'admin'].includes(u.role)) redirect('/portfolio');
  return u;
}

export async function requireStaff() {
  const u = await requireUser();
  if (!['super_admin', 'admin', 'accountant'].includes(u.role)) redirect('/portfolio');
  return u;
}

export async function requireShareholder() {
  const u = await requireUser();
  // accountants may also be shareholders — allow them through to portfolio
  if (!['super_admin', 'admin', 'accountant', 'shareholder'].includes(u.role)) {
    redirect('/login');
  }
  return u;
}
