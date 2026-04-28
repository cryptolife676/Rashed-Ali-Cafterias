import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Suspense fallback={<div className="card w-full max-w-sm text-center text-sm text-slate-400">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
