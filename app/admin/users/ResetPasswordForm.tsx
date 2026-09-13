'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setUserPassword } from '@/server/actions/account';

export type ManagedUser = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  is_self: boolean;
};

export default function ResetPasswordForm({ users }: { users: ManagedUser[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>, u: ManagedUser) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!confirm(
      `Set a new password for ${u.full_name}?\n\n` +
      `They will need this password to sign in, and any password they chose themselves will stop working. ` +
      `Tell them the new password through a channel you trust.`,
    )) return;
    start(async () => {
      const res = await setUserPassword({
        user_id: u.id,
        new_password: fd.get('new_password') as string,
        confirm_password: fd.get('confirm_password') as string,
      });
      if (!res.ok) { setMsg({ type: 'err', text: `${u.full_name}: ${res.error}` }); return; }
      form.reset();
      setOpenFor(null);
      setMsg({ type: 'ok', text: `Password set for ${u.full_name}. Pass it on securely.` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">
                  {u.full_name}
                  {u.is_self && <span className="ml-2 text-xs text-slate-400">you</span>}
                </td>
                <td className="text-slate-500">{u.email ?? '—'}</td>
                <td className="text-slate-500">{u.role}</td>
                <td>
                  {u.is_active
                    ? <span className="text-xs text-emerald-700">active</span>
                    : <span className="text-xs text-amber-700">inactive</span>}
                </td>
                <td>
                  {u.is_self ? (
                    <a href="/account" className="text-xs text-brand-700 hover:underline">
                      Change your own →
                    </a>
                  ) : (
                    <button
                      className="text-xs text-brand-700 hover:underline"
                      onClick={() => setOpenFor(openFor === u.id ? null : u.id)}
                    >
                      {openFor === u.id ? 'Cancel' : 'Set password'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="text-slate-400 py-6 text-center">No users.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {users
        .filter((u) => u.id === openFor && !u.is_self)
        .map((u) => (
          <form key={u.id} onSubmit={(e) => onSubmit(e, u)} className="card max-w-md space-y-3">
            <h3 className="font-semibold text-sm">
              New password for <span className="text-brand-700">{u.full_name}</span>
            </h3>
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
              <label className="label">Confirm</label>
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
              {pending ? 'Saving…' : 'Set password'}
            </button>
          </form>
        ))}
    </div>
  );
}
