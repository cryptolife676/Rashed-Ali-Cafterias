'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeOwnPassword } from '@/server/actions/account';

export default function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      current_password: hasPassword ? (fd.get('current_password') as string) : null,
      new_password: fd.get('new_password') as string,
      confirm_password: fd.get('confirm_password') as string,
    };
    start(async () => {
      const res = await changeOwnPassword(payload);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      form.reset();
      setMsg({ type: 'ok', text: 'Password updated. Use it next time you sign in.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 max-w-md">
      <h2 className="font-semibold">{hasPassword ? 'Change your password' : 'Set a password'}</h2>
      {!hasPassword && (
        <p className="text-sm text-slate-500">
          You sign in with Google. Setting a password lets you sign in with your
          email address as well — it does not remove Google sign-in.
        </p>
      )}

      {hasPassword && (
        <div>
          <label className="label">Current password</label>
          <input
            className="input"
            type="password"
            name="current_password"
            autoComplete="current-password"
            required
          />
        </div>
      )}
      <div>
        <label className="label">New password</label>
        <input
          className="input"
          type="password"
          name="new_password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="mt-1 text-xs text-slate-500">
          At least 8 characters, with a letter and a number.
        </p>
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input
          className="input"
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <button className="btn-primary" disabled={pending}>
        {pending ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
      </button>

      {msg && (
        <div className={`text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}
    </form>
  );
}
