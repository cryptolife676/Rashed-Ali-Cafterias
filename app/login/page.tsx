import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center font-bold text-lg">
            RA
          </div>
          <span className="font-semibold text-lg tracking-tight">Rashed Ali Co.</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Business Management<br />Made Simple
          </h1>
          <p className="text-brand-100 text-lg leading-relaxed max-w-sm">
            Track income, expenses, profit sharing and shareholder portfolios across all cafeteria branches.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { label: 'Branches', value: '3' },
              { label: 'Shareholders', value: '10+' },
              { label: 'Live tracking', value: '24/7' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur rounded-xl p-4">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-brand-200 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-brand-200 text-sm">© {new Date().getFullYear()} Rashed Ali Cafeteria</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-slate-50">
        {/* Glow border wrapper */}
        <div className="glow-card w-full max-w-sm">
          <div className="relative z-10 bg-white rounded-2xl px-8 py-10">
            {/* Mobile logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-white text-lg">
                RA
              </div>
              <span className="font-semibold text-lg text-slate-900">Rashed Ali Co.</span>
            </div>
            <Suspense fallback={
              <div className="text-center text-sm text-slate-400 py-8">Loading…</div>
            }>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
