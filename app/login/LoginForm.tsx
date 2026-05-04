'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const pendingApproval = params.get('error') === 'pending_approval';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    fetch('/api/activity/login', { method: 'POST' }).catch(() => {});
    router.replace(next);
    router.refresh();
  }

  async function onGoogle() {
    setGoogleLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setErr(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-slate-500">Rashed Ali Cafeteria</p>
      </div>
      {pendingApproval && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your account is pending admin approval. Contact your administrator to get access.
        </div>
      )}
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">Password</label>
        <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button className="btn-primary w-full" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs text-slate-400">or</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>
      <button
        type="button"
        onClick={onGoogle}
        disabled={googleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.1-6.1C34.46 3.09 29.5 1 24 1 14.82 1 7.07 6.48 3.64 14.22l7.1 5.52C12.4 13.67 17.73 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.1 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.42c-.54 2.9-2.18 5.36-4.64 7.01l7.18 5.58C43.18 37.18 46.1 31.27 46.1 24.5z"/>
          <path fill="#FBBC05" d="M10.74 28.26A14.5 14.5 0 0 1 9.5 24c0-1.48.25-2.91.74-4.26l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.86.92 7.5 2.54 10.72l8.2-6.46z"/>
          <path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.5-4.94l-7.18-5.58c-1.82 1.22-4.15 1.95-6.32 1.95-6.27 0-11.6-4.17-13.26-9.74l-8.2 6.46C7.07 41.52 14.82 47 24 47z"/>
        </svg>
        {googleLoading ? 'Redirecting…' : 'Sign in with Google'}
      </button>
    </form>
  );
}
