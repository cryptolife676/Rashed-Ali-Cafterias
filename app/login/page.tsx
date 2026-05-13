import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — brand (black + gold) ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white"
        style={{ background: 'linear-gradient(160deg, #1a1814 0%, #0c0b09 60%, #211f1b 100%)' }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-bold text-xl"
            style={{ background: 'linear-gradient(135deg, #c9a227, #e8c96a)', color: '#0c0b09' }}
          >
            RA
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-tight tracking-wide">RASHED ALI</div>
            <div className="text-xs tracking-widest" style={{ color: '#c9a227' }}>GROUP OF COMPANIES</div>
          </div>
        </div>

        {/* Hero text */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: '#c9a227' }}>
            Management Portal
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight mb-5 text-white">
            Business<br />Intelligence<br />
            <span style={{ color: '#c9a227' }}>Simplified.</span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-xs">
            Track income, expenses, profit distributions and shareholder portfolios — across all branches.
          </p>

          {/* Stat row */}
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              { label: 'Branches',    value: '3' },
              { label: 'Shareholders', value: '10+' },
              { label: 'Live',         value: '24/7' },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl p-4"
                style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.2)' }}
              >
                <div className="text-2xl font-bold" style={{ color: '#c9a227' }}>{value}</div>
                <div className="text-slate-500 text-xs mt-0.5 font-medium">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs">© {new Date().getFullYear()} Rashed Ali Cafeteria</p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-slate-50">

        {/* Mobile logo */}
        <div className="flex items-center gap-3 mb-8 lg:hidden">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base"
            style={{ background: 'linear-gradient(135deg, #c9a227, #e8c96a)', color: '#0c0b09' }}
          >
            RA
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">RASHED ALI</div>
            <div className="text-[10px] text-slate-400 tracking-widest">GROUP OF COMPANIES</div>
          </div>
        </div>

        {/* Glow-border card */}
        <div className="glow-card w-full max-w-sm">
          <div className="relative z-10 bg-white rounded-2xl px-8 py-10">
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
