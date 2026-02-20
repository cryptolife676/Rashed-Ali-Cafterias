import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase Client ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Web Crypto PBKDF2 Helpers ────────────────────────────────────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashArray = Array.from(new Uint8Array(bits));
  const saltArray = Array.from(salt);
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = saltArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  if (!stored.startsWith('pbkdf2:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const saltHex = parts[1];
  const storedHash = parts[2];
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashArray = Array.from(new Uint8Array(bits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === storedHash;
}

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body {
      font-family: 'Tajawal', sans-serif;
      background: #0D0D0D;
      color: #E8E0D0;
      overflow-x: hidden;
    }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #1A1A1A; }
    ::-webkit-scrollbar-thumb { background: #C9A84C44; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #C9A84C88; }

    .fade-in { animation: fadeIn 0.35s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .card {
      background: #1A1A1A;
      border: 1px solid #2A2A2A;
      border-radius: 12px;
      padding: 20px;
    }
    .card-gold { border-color: #C9A84C33; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 18px; border-radius: 8px; border: none;
      font-family: 'Tajawal', sans-serif; font-size: 14px; font-weight: 500;
      cursor: pointer; transition: all 0.2s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #C9A84C; color: #0D0D0D; }
    .btn-primary:hover:not(:disabled) { background: #DFB95D; }
    .btn-green { background: #16a34a; color: #fff; }
    .btn-green:hover:not(:disabled) { background: #15803d; }
    .btn-danger { background: #D4614E22; color: #D4614E; border: 1px solid #D4614E44; }
    .btn-danger:hover:not(:disabled) { background: #D4614E33; }
    .btn-ghost { background: transparent; color: #aaa; border: 1px solid #333; }
    .btn-ghost:hover:not(:disabled) { background: #222; color: #eee; }
    .btn-sm { padding: 5px 12px; font-size: 13px; }

    .input, .select, textarea {
      width: 100%; padding: 10px 14px;
      background: #111; border: 1px solid #333;
      border-radius: 8px; color: #E8E0D0;
      font-family: 'Tajawal', sans-serif; font-size: 14px;
      transition: border-color 0.2s;
    }
    .input:focus, .select:focus, textarea:focus {
      outline: none; border-color: #C9A84C66;
    }
    .input::placeholder { color: #555; }
    .select option { background: #1A1A1A; }

    label { display: block; font-size: 13px; color: #888; margin-bottom: 5px; font-weight: 500; }

    .form-group { margin-bottom: 16px; }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 14px; color: #888; font-weight: 500; font-size: 12px; border-bottom: 1px solid #2A2A2A; white-space: nowrap; }
    td { padding: 11px 14px; border-bottom: 1px solid #1F1F1F; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1F1F1F; }

    .badge {
      display: inline-block; padding: 2px 10px; border-radius: 20px;
      font-size: 12px; font-weight: 500;
    }
    .badge-green { background: #16a34a22; color: #4ade80; border: 1px solid #16a34a44; }
    .badge-red { background: #D4614E22; color: #D4614E; border: 1px solid #D4614E44; }
    .badge-blue { background: #4E8FA622; color: #7ec8e3; border: 1px solid #4E8FA644; }
    .badge-gold { background: #C9A84C22; color: #C9A84C; border: 1px solid #C9A84C44; }
    .badge-gray { background: #33333366; color: #888; border: 1px solid #444; }

    .modal-overlay {
      position: fixed; inset: 0; background: #00000099;
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 20px;
      backdrop-filter: blur(4px);
    }
    .modal {
      background: #1A1A1A; border: 1px solid #2A2A2A;
      border-radius: 16px; padding: 28px; width: 100%;
      max-width: 480px; max-height: 90vh; overflow-y: auto;
      animation: fadeIn 0.25s ease;
    }
    .modal-title {
      font-size: 18px; font-weight: 600; color: #C9A84C;
      margin-bottom: 20px; font-family: 'Playfair Display', serif;
    }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

    .stat-card {
      background: #1A1A1A; border: 1px solid #2A2A2A;
      border-radius: 12px; padding: 18px 20px;
    }
    .stat-label { font-size: 12px; color: #666; margin-bottom: 6px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
    .stat-value { font-size: 22px; font-weight: 700; font-family: 'Playfair Display', serif; }

    .alert {
      padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px;
    }
    .alert-error { background: #D4614E22; border: 1px solid #D4614E44; color: #D4614E; }
    .alert-success { background: #16a34a22; border: 1px solid #16a34a44; color: #4ade80; }
    .alert-warn { background: #C9A84C22; border: 1px solid #C9A84C44; color: #C9A84C; }

    .page-title {
      font-family: 'Playfair Display', serif;
      font-size: 26px; font-weight: 700;
      color: #E8E0D0; margin-bottom: 6px;
    }
    .page-subtitle { font-size: 14px; color: #666; margin-bottom: 24px; }

    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
    .section-title { font-size: 16px; font-weight: 600; color: #C9A84C; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 480px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }

    .divider { border: none; border-top: 1px solid #2A2A2A; margin: 20px 0; }

    .text-income { color: #6BAA75; }
    .text-expense { color: #D4614E; }
    .text-profit { color: #4E8FA6; }
    .text-gold { color: #C9A84C; }
    .text-muted { color: #666; }

    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 20px; font-size: 12px;
      background: #222; border: 1px solid #333; color: #aaa;
    }

    .progress-bar { height: 6px; background: #222; border-radius: 3px; overflow: hidden; margin-top: 6px; }
    .progress-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
  `}</style>
);

// ─── Constants ────────────────────────────────────────────────────────────────
const INCOME_CATEGORIES = ['Sales', 'Catering', 'Delivery', 'Beverages', 'Food', 'Other'];
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Supplies', 'Utilities', 'Maintenance', 'Marketing', 'Other'];
const ROLES = ['super_admin', 'manager', 'accountant', 'partner', 'viewer'];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  partner: 'Partner',
  viewer: 'Viewer',
};

const canAccess = (role, page) => {
  const access = {
    super_admin: ['dashboard', 'branches', 'income', 'expenses', 'partners', 'users', 'reports'],
    manager:     ['dashboard', 'income', 'expenses', 'reports'],
    accountant:  ['dashboard', 'income', 'expenses', 'partners', 'reports'],
    partner:     ['dashboard', 'partners', 'reports'],
    viewer:      ['dashboard'],
  };
  return (access[role] || []).includes(page);
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬛' },
  { id: 'branches',  label: 'Branches',  icon: '🏪' },
  { id: 'income',    label: 'Income',    icon: '📈' },
  { id: 'expenses',  label: 'Expenses',  icon: '📉' },
  { id: 'partners',  label: 'Partners',  icon: '🤝' },
  { id: 'users',     label: 'Users',     icon: '👥' },
  { id: 'reports',   label: 'Reports',   icon: '📊' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const today = () => new Date().toISOString().split('T')[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);

// ─── Small UI Components ──────────────────────────────────────────────────────
function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{children}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>}
    </div>
  );
}

function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="modal-title">{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Confirm({ message, onConfirm, onCancel }) {
  return (
    <Modal title="Confirm Action" onClose={onCancel}>
      <p style={{ color: '#ccc', marginBottom: 20 }}>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
      </div>
    </Modal>
  );
}

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #2A2A2A', borderTop: '3px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data: users, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .eq('is_active', true)
        .limit(1);

      if (fetchErr || !users || users.length === 0) {
        setError('Invalid email or password');
        setLoading(false); return;
      }
      const user = users[0];

      let passwordOk = false;
      if (user.password_hash && user.password_hash.startsWith('pbkdf2:')) {
        passwordOk = await verifyPassword(password, user.password_hash);
      } else {
        // Plain text upgrade
        if (user.password_hash === password || user.password_hash === password.trim()) {
          passwordOk = true;
          const newHash = await hashPassword(password);
          await supabase.from('users').update({ password_hash: newHash }).eq('id', user.id);
        }
      }

      if (!passwordOk) {
        setError('Invalid email or password');
        setLoading(false); return;
      }

      await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

      const sessionUser = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
      localStorage.setItem('ra_session', JSON.stringify(sessionUser));
      onLogin(sessionUser);
    } catch (err) {
      setError('Login failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 30% 20%, #1a1200 0%, #0D0D0D 60%)',
      padding: 20
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%', margin: '0 auto 16px',
            background: '#1A1A1A', border: '2px solid #C9A84C44',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden'
          }}>
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:40px">☕</span>'; }} />
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#C9A84C', marginBottom: 4 }}>
            Rashed Ali
          </div>
          <div style={{ fontFamily: "'Tajawal', sans-serif", fontSize: 20, fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>
            راشد علي
          </div>
          <div style={{ fontSize: 13, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>
            Cafeterias
          </div>
        </div>

        {/* Form Card */}
        <div className="card card-gold" style={{ boxShadow: '0 20px 60px #00000088' }}>
          <div style={{ marginBottom: 20, color: '#888', fontSize: 14 }}>Sign in to your account</div>
          <Alert type="error" onClose={() => setError('')}>{error}</Alert>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="input" type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#333' }}>
          Rashed Ali Cafeterias © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ user, currentPage, onNavigate, onLogout, sidebarOpen, setSidebarOpen }) {
  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 99, display: 'none' }}
          className="mobile-overlay"
        />
      )}
      <style>{`
        @media (max-width: 768px) {
          .sidebar { transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'}; }
          .mobile-overlay { display: block !important; }
        }
      `}</style>
      <aside className="sidebar" style={{
        width: 280, background: '#1A1A1A', borderRight: '1px solid #2A2A2A',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100,
        transition: 'transform 0.3s ease',
      }}>
        {/* Brand */}
        <div style={{
          padding: '24px 20px 20px', borderBottom: '1px solid #2A2A2A',
          background: 'linear-gradient(180deg, #1F1A10 0%, #1A1A1A 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
              border: '2px solid #C9A84C44', flexShrink: 0,
              background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:22px">☕</span>'; }} />
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#C9A84C', lineHeight: 1.2 }}>
                Rashed Ali
              </div>
              <div style={{ fontFamily: "'Tajawal', sans-serif", fontSize: 16, fontWeight: 700, color: '#16a34a', lineHeight: 1.2 }}>
                راشد علي
              </div>
              <div style={{ fontSize: 11, color: '#fff', opacity: 0.6, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>
                Cafeterias كافتيريا
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
          {navItems.filter(n => canAccess(user.role, n.id)).map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: currentPage === item.id ? '#C9A84C1A' : 'transparent',
                color: currentPage === item.id ? '#C9A84C' : '#888',
                borderLeft: currentPage === item.id ? '3px solid #C9A84C' : '3px solid transparent',
                fontSize: 14, fontFamily: "'Tajawal', sans-serif", fontWeight: 500,
                textAlign: 'left', marginBottom: 2, transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '16px', borderTop: '1px solid #2A2A2A' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: '#C9A84C22',
              border: '1px solid #C9A84C44', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#C9A84C', flexShrink: 0
            }}>
              {user.full_name ? user.full_name[0].toUpperCase() : '?'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E0D0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>{ROLE_LABELS[user.role] || user.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onLogout} style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user }) {
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: br } = await supabase.from('branches').select('*').eq('is_active', true);
    const branchList = br || [];
    setBranches(branchList);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = now.toISOString().slice(0, 7);

    const { data: incToday } = await supabase.from('income_entries').select('*').gte('entry_date', todayStr).lte('entry_date', todayStr);
    const { data: expToday } = await supabase.from('expense_entries').select('*').gte('entry_date', todayStr).lte('entry_date', todayStr);
    const { data: incMonth } = await supabase.from('income_entries').select('*').gte('entry_date', monthStr + '-01').lte('entry_date', monthStr + '-31');
    const { data: expMonth } = await supabase.from('expense_entries').select('*').gte('entry_date', monthStr + '-01').lte('entry_date', monthStr + '-31');

    const byBranch = {};
    branchList.forEach(b => {
      byBranch[b.id] = { incToday: 0, expToday: 0, incMonth: 0, expMonth: 0, name: b.name };
    });
    (incToday || []).forEach(e => { if (byBranch[e.branch_id]) byBranch[e.branch_id].incToday += Number(e.amount); });
    (expToday || []).forEach(e => { if (byBranch[e.branch_id]) byBranch[e.branch_id].expToday += Number(e.amount); });
    (incMonth || []).forEach(e => { if (byBranch[e.branch_id]) byBranch[e.branch_id].incMonth += Number(e.amount); });
    (expMonth || []).forEach(e => { if (byBranch[e.branch_id]) byBranch[e.branch_id].expMonth += Number(e.amount); });

    setStats(byBranch);
    setLoading(false);
  };

  const totalToday = Object.values(stats).reduce((a, b) => ({ incToday: a.incToday + b.incToday, expToday: a.expToday + b.expToday }), { incToday: 0, expToday: 0 });
  const totalMonth = Object.values(stats).reduce((a, b) => ({ incMonth: a.incMonth + b.incMonth, expMonth: a.expMonth + b.expMonth }), { incMonth: 0, expMonth: 0 });

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Welcome back, {user.full_name} — {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <img src="/dashboard.png" alt="" style={{ height: 60, opacity: 0.6 }}
            onError={e => e.target.style.display = 'none'} />
        </div>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* Summary Row */}
          <div style={{ marginBottom: 10, fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Today's Summary</div>
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card" style={{ borderColor: '#6BAA7544' }}>
              <div className="stat-label">Today's Income</div>
              <div className="stat-value text-income">AED {fmt(totalToday.incToday)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#D4614E44' }}>
              <div className="stat-label">Today's Expenses</div>
              <div className="stat-value text-expense">AED {fmt(totalToday.expToday)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#4E8FA644' }}>
              <div className="stat-label">Today's Profit</div>
              <div className="stat-value text-profit">AED {fmt(totalToday.incToday - totalToday.expToday)}</div>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>This Month's Summary</div>
          <div className="grid-3" style={{ marginBottom: 32 }}>
            <div className="stat-card" style={{ borderColor: '#6BAA7544' }}>
              <div className="stat-label">Monthly Income</div>
              <div className="stat-value text-income">AED {fmt(totalMonth.incMonth)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#D4614E44' }}>
              <div className="stat-label">Monthly Expenses</div>
              <div className="stat-value text-expense">AED {fmt(totalMonth.expMonth)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#4E8FA644' }}>
              <div className="stat-label">Monthly Profit</div>
              <div className="stat-value text-profit">AED {fmt(totalMonth.incMonth - totalMonth.expMonth)}</div>
            </div>
          </div>

          {/* Per Branch */}
          {branches.length > 0 && (
            <>
              <div style={{ marginBottom: 14, fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Per Branch — This Month</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {branches.map(b => {
                  const s = stats[b.id] || {};
                  const profit = (s.incMonth || 0) - (s.expMonth || 0);
                  const total = s.incMonth || 0;
                  return (
                    <div key={b.id} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                      <div style={{ minWidth: 140 }}>
                        <div style={{ fontWeight: 600, color: '#C9A84C', fontSize: 15 }}>{b.name}</div>
                        <div style={{ fontSize: 12, color: '#555' }}>{b.location || '—'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 24, flex: 1, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#666' }}>INCOME</div>
                          <div className="text-income" style={{ fontWeight: 700 }}>AED {fmt(s.incMonth)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#666' }}>EXPENSES</div>
                          <div className="text-expense" style={{ fontWeight: 700 }}>AED {fmt(s.expMonth)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#666' }}>PROFIT</div>
                          <div className={profit >= 0 ? 'text-profit' : 'text-expense'} style={{ fontWeight: 700 }}>AED {fmt(profit)}</div>
                        </div>
                      </div>
                      <div style={{ width: 120 }}>
                        <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>Income utilization</div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{
                            width: total ? `${Math.min(100, ((s.expMonth || 0) / total) * 100)}%` : '0%',
                            background: profit >= 0 ? '#6BAA75' : '#D4614E'
                          }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Branches ─────────────────────────────────────────────────────────────────
function Branches({ user }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', location: '' });
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').order('created_at', { ascending: false });
    setBranches(data || []);
    setLoading(false);
  };

  const openAdd = () => { setEditing(null); setForm({ name: '', location: '' }); setError(''); setShowModal(true); };
  const openEdit = (b) => { setEditing(b); setForm({ name: b.name, location: b.location || '' }); setError(''); setShowModal(true); };

  const save = async () => {
    if (!form.name.trim()) { setError('Branch name is required'); return; }
    setError('');
    if (editing) {
      await supabase.from('branches').update({ name: form.name.trim(), location: form.location.trim() }).eq('id', editing.id);
    } else {
      await supabase.from('branches').insert({ name: form.name.trim(), location: form.location.trim(), is_active: true });
    }
    setShowModal(false);
    load();
  };

  const toggleActive = async (b) => {
    await supabase.from('branches').update({ is_active: !b.is_active }).eq('id', b.id);
    load();
  };

  const deleteBranch = async (id) => {
    await supabase.from('branches').delete().eq('id', id);
    setConfirm(null);
    load();
  };

  if (user.role !== 'super_admin') return <div className="card"><p className="text-muted">Access denied.</p></div>;

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div className="page-title">Branches</div>
          <div className="page-subtitle">Manage cafeteria locations</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Branch</button>
      </div>

      <div className="card">
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Name</th><th>Location</th><th>Status</th><th>Created</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {branches.length === 0 && <tr><td colSpan={5} style={{ color: '#555', textAlign: 'center', padding: 24 }}>No branches yet</td></tr>}
                {branches.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600, color: '#C9A84C' }}>{b.name}</td>
                    <td style={{ color: '#888' }}>{b.location || '—'}</td>
                    <td><span className={`badge ${b.is_active ? 'badge-green' : 'badge-gray'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ color: '#555', fontSize: 12 }}>{b.created_at?.slice(0, 10)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(b)}>
                          {b.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: b.id, name: b.name })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Branch' : 'Add Branch'} onClose={() => setShowModal(false)}>
          <Alert type="error">{error}</Alert>
          <div className="form-group">
            <label>Branch Name *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main Branch" />
          </div>
          <div className="form-group">
            <label>Location</label>
            <input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Abu Dhabi Mall" />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing ? 'Save Changes' : 'Add Branch'}</button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm
          message={`Delete branch "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => deleteBranch(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Income / Expense Entries (shared component) ──────────────────────────────
function EntriesPage({ user, type }) {
  const isIncome = type === 'income';
  const table = isIncome ? 'income_entries' : 'expense_entries';
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const color = isIncome ? '#6BAA75' : '#D4614E';
  const title = isIncome ? 'Income' : 'Expenses';

  const [entries, setEntries] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ branch_id: '', entry_date: today(), amount: '', category: categories[0], notes: '' });
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterMonth, setFilterMonth] = useState(thisMonth());

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { if (branches.length) loadEntries(); }, [branches, filterBranch, filterMonth]);

  const loadBranches = async () => {
    const { data } = await supabase.from('branches').select('*').eq('is_active', true);
    setBranches(data || []);
  };

  const loadEntries = async () => {
    setLoading(true);
    let q = supabase.from(table).select('*, branches(name)').order('entry_date', { ascending: false });
    if (filterBranch) q = q.eq('branch_id', filterBranch);
    if (filterMonth) {
      q = q.gte('entry_date', filterMonth + '-01').lte('entry_date', filterMonth + '-31');
    }
    const { data } = await q;
    setEntries(data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setForm({ branch_id: branches[0]?.id || '', entry_date: today(), amount: '', category: categories[0], notes: '' });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!form.branch_id) { setError('Select a branch'); return; }
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) { setError('Enter a valid amount'); return; }
    setError('');
    await supabase.from(table).insert({
      branch_id: form.branch_id, entry_date: form.entry_date,
      amount: Number(form.amount), category: form.category,
      notes: form.notes.trim(), recorded_by: user.id
    });
    setShowModal(false);
    loadEntries();
  };

  const deleteEntry = async (id) => {
    await supabase.from(table).delete().eq('id', id);
    setConfirm(null);
    loadEntries();
  };

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div className="page-title" style={{ color }}>{title}</div>
          <div className="page-subtitle">
            {entries.length} entries — Total: AED {fmt(total)}
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Entry</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto', minWidth: 150 }}
          value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input className="input" type="month" style={{ width: 'auto' }}
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
      </div>

      <div className="card">
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>Branch</th><th>Category</th><th>Amount</th><th>Notes</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {entries.length === 0 && <tr><td colSpan={6} style={{ color: '#555', textAlign: 'center', padding: 24 }}>No entries found</td></tr>}
                {entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 13, color: '#888' }}>{e.entry_date}</td>
                    <td style={{ color: '#C9A84C', fontWeight: 500 }}>{e.branches?.name || '—'}</td>
                    <td><span className="chip">{e.category}</span></td>
                    <td style={{ color, fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>
                      AED {fmt(e.amount)}
                    </td>
                    <td style={{ color: '#666', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: e.id })}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 600, color: '#888', paddingTop: 12 }}>Total</td>
                    <td style={{ color, fontWeight: 700, fontFamily: "'Playfair Display', serif", paddingTop: 12 }}>AED {fmt(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={`Add ${title} Entry`} onClose={() => setShowModal(false)}>
          <Alert type="error">{error}</Alert>
          <div className="grid-2">
            <div className="form-group">
              <label>Branch *</label>
              <select className="select" value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
                <option value="">Select…</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input className="input" type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Amount (AED) *</label>
              <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Add Entry</button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm
          message="Delete this entry? This cannot be undone."
          onConfirm={() => deleteEntry(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Partners ─────────────────────────────────────────────────────────────────
function Partners({ user }) {
  const [partners, setPartners] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', branch_id: '', ownership_pct: '' });
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(null);
  const [linkUserId, setLinkUserId] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: p }, { data: b }, { data: u }] = await Promise.all([
      supabase.from('partners').select('*, branches(name), users(full_name, email)').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').eq('is_active', true),
      supabase.from('users').select('id, full_name, email').eq('is_active', true),
    ]);
    setPartners(p || []);
    setBranches(b || []);
    setUsers(u || []);
    setLoading(false);
  };

  const getBranchTotal = (branchId, excludeId = null) => {
    return partners
      .filter(p => p.branch_id === branchId && p.id !== excludeId && p.is_active)
      .reduce((s, p) => s + Number(p.ownership_pct), 0);
  };

  const selectedBranchId = form.branch_id;
  const allocatedInBranch = getBranchTotal(selectedBranchId, editing?.id);
  const remaining = 100 - allocatedInBranch;

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', branch_id: branches[0]?.id || '', ownership_pct: '' });
    setError(''); setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({ name: p.name, branch_id: p.branch_id, ownership_pct: String(p.ownership_pct) });
    setError(''); setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setError('Partner name is required'); return; }
    if (!form.branch_id) { setError('Select a branch'); return; }
    const pct = Number(form.ownership_pct);
    if (!pct || pct <= 0 || pct > 100) { setError('Enter a valid ownership percentage (1-100)'); return; }
    if (pct > remaining) {
      setError(`Cannot exceed 100% total ownership. Only ${remaining.toFixed(2)}% remaining for this branch.`);
      return;
    }
    setError('');
    if (editing) {
      await supabase.from('partners').update({ name: form.name.trim(), branch_id: form.branch_id, ownership_pct: pct }).eq('id', editing.id);
    } else {
      await supabase.from('partners').insert({ name: form.name.trim(), branch_id: form.branch_id, ownership_pct: pct, is_active: true });
    }
    setShowModal(false);
    loadAll();
  };

  const toggleActive = async (p) => {
    await supabase.from('partners').update({ is_active: !p.is_active }).eq('id', p.id);
    loadAll();
  };

  const deletePartner = async (id) => {
    await supabase.from('partners').delete().eq('id', id);
    setConfirm(null); loadAll();
  };

  const linkUser = async () => {
    await supabase.from('partners').update({ user_id: linkUserId || null }).eq('id', showLinkModal.id);
    setShowLinkModal(null); loadAll();
  };

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div className="page-title" style={{ color: '#16a34a' }}>Partners</div>
          <div className="page-subtitle">Manage ownership and profit shares</div>
        </div>
        <button className="btn btn-green" onClick={openAdd}>+ Add Partner</button>
      </div>

      <div className="card">
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Name</th><th>Branch</th><th>Ownership %</th><th>Linked User</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {partners.length === 0 && <tr><td colSpan={6} style={{ color: '#555', textAlign: 'center', padding: 24 }}>No partners yet</td></tr>}
                {partners.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: '#C9A84C' }}>{p.branches?.name || '—'}</td>
                    <td>
                      <span style={{ color: '#16a34a', fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>
                        {p.ownership_pct}%
                      </span>
                    </td>
                    <td style={{ color: '#888', fontSize: 13 }}>
                      {p.users ? `${p.users.full_name} (${p.users.email})` : <span className="text-muted">Not linked</span>}
                    </td>
                    <td><span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>{p.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                        {user.role === 'super_admin' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setShowLinkModal(p); setLinkUserId(p.user_id || ''); }}>
                            {p.user_id ? 'Relink' : 'Link User'}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)}>
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: p.id, name: p.name })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Branch Ownership Summary */}
      {branches.length > 0 && !loading && (
        <div style={{ marginTop: 24 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Branch Ownership Summary</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {branches.map(b => {
              const branchPartners = partners.filter(p => p.branch_id === b.id && p.is_active);
              const allocated = branchPartners.reduce((s, p) => s + Number(p.ownership_pct), 0);
              return (
                <div key={b.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, color: '#C9A84C' }}>{b.name}</span>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ color: '#16a34a' }}>{allocated.toFixed(1)}% allocated</span>
                      <span style={{ color: '#555' }}> / </span>
                      <span style={{ color: '#888' }}>{(100 - allocated).toFixed(1)}% remaining</span>
                    </span>
                  </div>
                  <div className="progress-bar" style={{ height: 8 }}>
                    <div className="progress-fill" style={{
                      width: `${Math.min(100, allocated)}%`,
                      background: allocated > 99 ? '#D4614E' : '#16a34a'
                    }} />
                  </div>
                  {branchPartners.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {branchPartners.map(p => (
                        <span key={p.id} className="chip" style={{ borderColor: '#16a34a44', color: '#4ade80' }}>
                          {p.name}: {p.ownership_pct}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Partner' : 'Add Partner'} onClose={() => setShowModal(false)}>
          <Alert type="error">{error}</Alert>
          <div className="form-group">
            <label>Partner Name *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </div>
          <div className="form-group">
            <label>Branch *</label>
            <select className="select" value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Ownership % *</label>
            <input className="input" type="number" min="0.01" max="100" step="0.01"
              value={form.ownership_pct} onChange={e => setForm({ ...form, ownership_pct: e.target.value })}
              placeholder="e.g. 25" />
          </div>
          {/* Live summary */}
          {form.branch_id && (
            <div style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Branch Ownership Status</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#888' }}>Already allocated:</span>
                <span style={{ color: '#C9A84C' }}>{allocatedInBranch.toFixed(2)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                <span style={{ color: '#888' }}>Remaining:</span>
                <span style={{ color: remaining < 10 ? '#D4614E' : '#6BAA75' }}>{remaining.toFixed(2)}%</span>
              </div>
              <div className="progress-bar" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${Math.min(100, allocatedInBranch)}%`, background: remaining < 10 ? '#D4614E' : '#16a34a' }} />
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{editing ? 'Save Changes' : 'Add Partner'}</button>
          </div>
        </Modal>
      )}

      {showLinkModal && user.role === 'super_admin' && (
        <Modal title="Link User Account" onClose={() => setShowLinkModal(null)}>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
            Linking user to partner: <strong style={{ color: '#C9A84C' }}>{showLinkModal.name}</strong>
          </p>
          <div className="form-group">
            <label>User Account</label>
            <select className="select" value={linkUserId} onChange={e => setLinkUserId(e.target.value)}>
              <option value="">No linked user</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowLinkModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={linkUser}>Save Link</button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm
          message={`Delete partner "${confirm.name}"?`}
          onConfirm={() => deletePartner(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────
function Users({ user: currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'viewer', password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [showPwModal, setShowPwModal] = useState(null);
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('users').select('id, full_name, email, role, is_active, last_login, created_at').order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ full_name: '', email: '', role: 'viewer', password: '', confirm_password: '' });
    setError(''); setShowModal(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ full_name: u.full_name, email: u.email, role: u.role, password: '', confirm_password: '' });
    setError(''); setShowModal(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) { setError('Name is required'); return; }
    if (!form.email.trim()) { setError('Email is required'); return; }
    if (!editing && !form.password) { setError('Password is required for new users'); return; }
    if (form.password && form.password !== form.confirm_password) { setError('Passwords do not match'); return; }
    setError('');

    if (editing) {
      const update = { full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), role: form.role };
      if (form.password) update.password_hash = await hashPassword(form.password);
      await supabase.from('users').update(update).eq('id', editing.id);
    } else {
      const hash = await hashPassword(form.password);
      await supabase.from('users').insert({ full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), role: form.role, password_hash: hash, is_active: true });
    }
    setShowModal(false);
    setSuccess(editing ? 'User updated.' : 'User created.');
    setTimeout(() => setSuccess(''), 3000);
    load();
  };

  const toggleActive = async (u) => {
    await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id);
    load();
  };

  const deleteUser = async (id) => {
    await supabase.from('users').delete().eq('id', id);
    setConfirm(null); load();
  };

  const changePassword = async () => {
    if (!pwForm.password || pwForm.password.length < 6) { setPwError('Password must be at least 6 characters'); return; }
    if (pwForm.password !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    setPwError('');
    const hash = await hashPassword(pwForm.password);
    await supabase.from('users').update({ password_hash: hash }).eq('id', showPwModal.id);
    setShowPwModal(null);
    setSuccess('Password changed successfully.');
    setTimeout(() => setSuccess(''), 3000);
  };

  if (currentUser.role !== 'super_admin') return <div className="card"><p className="text-muted">Access denied.</p></div>;

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-subtitle">Manage user accounts and permissions</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>
      {success && <Alert type="success">{success}</Alert>}

      <div className="card">
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {users.length === 0 && <tr><td colSpan={6} style={{ color: '#555', textAlign: 'center', padding: 24 }}>No users yet</td></tr>}
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td style={{ color: '#888', fontSize: 13 }}>{u.email}</td>
                    <td><span className="badge badge-gold">{ROLE_LABELS[u.role] || u.role}</span></td>
                    <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ color: '#555', fontSize: 12 }}>{u.last_login ? u.last_login.slice(0, 10) : 'Never'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                        {(currentUser.role === 'super_admin' || currentUser.id === u.id) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setShowPwModal(u); setPwForm({ password: '', confirm: '' }); setPwError(''); }}>
                            Change PW
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {u.id !== currentUser.id && (
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: u.id, name: u.full_name })}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit User' : 'Add User'} onClose={() => setShowModal(false)}>
          <Alert type="error">{error}</Alert>
          <div className="form-group">
            <label>Full Name *</label>
            <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          {!editing && (
            <div className="grid-2">
              <div className="form-group">
                <label>Password *</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input className="input" type="password" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })} />
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing ? 'Save Changes' : 'Create User'}</button>
          </div>
        </Modal>
      )}

      {showPwModal && (
        <Modal title={`Change Password — ${showPwModal.full_name}`} onClose={() => setShowPwModal(null)}>
          <Alert type="error">{pwError}</Alert>
          <div className="form-group">
            <label>New Password</label>
            <input className="input" type="password" value={pwForm.password} onChange={e => setPwForm({ ...pwForm, password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input className="input" type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowPwModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={changePassword}>Change Password</button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm
          message={`Delete user "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => deleteUser(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────
function Reports({ user }) {
  const [branches, setBranches] = useState([]);
  const [partners, setPartners] = useState([]);
  const [incomeData, setIncomeData] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { if (branches.length >= 0) loadReport(); }, [filterBranch, filterMonth]);

  const loadBranches = async () => {
    const { data: b } = await supabase.from('branches').select('*');
    const { data: p } = await supabase.from('partners').select('*').eq('is_active', true);
    setBranches(b || []);
    setPartners(p || []);
  };

  const loadReport = async () => {
    setLoading(true);
    const start = filterMonth + '-01';
    const end = filterMonth + '-31';
    let iq = supabase.from('income_entries').select('*, branches(name)').gte('entry_date', start).lte('entry_date', end);
    let eq = supabase.from('expense_entries').select('*, branches(name)').gte('entry_date', start).lte('entry_date', end);
    if (filterBranch) { iq = iq.eq('branch_id', filterBranch); eq = eq.eq('branch_id', filterBranch); }
    const [{ data: inc }, { data: exp }] = await Promise.all([iq, eq]);
    setIncomeData(inc || []);
    setExpenseData(exp || []);
    setLoading(false);
  };

  const totalIncome = incomeData.reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = expenseData.reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalExpense;

  // Category breakdown
  const incByCategory = {};
  incomeData.forEach(e => { incByCategory[e.category] = (incByCategory[e.category] || 0) + Number(e.amount); });
  const expByCategory = {};
  expenseData.forEach(e => { expByCategory[e.category] = (expByCategory[e.category] || 0) + Number(e.amount); });

  // Per branch
  const byBranch = {};
  branches.forEach(b => { byBranch[b.id] = { name: b.name, income: 0, expense: 0 }; });
  incomeData.forEach(e => { if (byBranch[e.branch_id]) byBranch[e.branch_id].income += Number(e.amount); });
  expenseData.forEach(e => { if (byBranch[e.branch_id]) byBranch[e.branch_id].expense += Number(e.amount); });

  // Partner shares
  const partnerShares = partners.map(p => {
    const branchIncome = Object.values(byBranch).find((_, i) => Object.keys(byBranch)[i] === p.branch_id)?.income || 0;
    const branchProfit = (byBranch[p.branch_id]?.income || 0) - (byBranch[p.branch_id]?.expense || 0);
    const share = branchProfit * (Number(p.ownership_pct) / 100);
    return { ...p, branchProfit, share, branchName: byBranch[p.branch_id]?.name || '—' };
  }).filter(p => !filterBranch || p.branch_id === filterBranch);

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Financial reports and partner profit distribution</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto', minWidth: 150 }}
          value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input className="input" type="month" style={{ width: 'auto' }}
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
      </div>

      {loading ? <Loading /> : (
        <>
          {/* Summary */}
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card" style={{ borderColor: '#6BAA7544' }}>
              <div className="stat-label">Total Income</div>
              <div className="stat-value text-income">AED {fmt(totalIncome)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#D4614E44' }}>
              <div className="stat-label">Total Expenses</div>
              <div className="stat-value text-expense">AED {fmt(totalExpense)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: '#4E8FA644' }}>
              <div className="stat-label">Net Profit</div>
              <div className={`stat-value ${totalProfit >= 0 ? 'text-profit' : 'text-expense'}`}>AED {fmt(totalProfit)}</div>
            </div>
          </div>

          {/* Branch Breakdown */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 14 }}>Branch Performance</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Branch</th><th>Income</th><th>Expenses</th><th>Profit</th><th>Margin</th></tr></thead>
                <tbody>
                  {Object.values(byBranch).map((b, i) => {
                    const profit = b.income - b.expense;
                    const margin = b.income > 0 ? (profit / b.income * 100) : 0;
                    if (b.income === 0 && b.expense === 0) return null;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: '#C9A84C' }}>{b.name}</td>
                        <td className="text-income">AED {fmt(b.income)}</td>
                        <td className="text-expense">AED {fmt(b.expense)}</td>
                        <td className={profit >= 0 ? 'text-profit' : 'text-expense'} style={{ fontWeight: 700 }}>AED {fmt(profit)}</td>
                        <td style={{ color: margin >= 0 ? '#6BAA75' : '#D4614E', fontSize: 13 }}>{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  {Object.values(byBranch).every(b => b.income === 0 && b.expense === 0) && (
                    <tr><td colSpan={5} style={{ color: '#555', textAlign: 'center', padding: 20 }}>No data for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="section-title" style={{ color: '#6BAA75', marginBottom: 14 }}>Income by Category</div>
              {Object.keys(incByCategory).length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>No income data</p>
              ) : (
                Object.entries(incByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="chip">{cat}</span>
                    <span className="text-income" style={{ fontWeight: 600 }}>AED {fmt(amt)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="card">
              <div className="section-title" style={{ color: '#D4614E', marginBottom: 14 }}>Expenses by Category</div>
              {Object.keys(expByCategory).length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>No expense data</p>
              ) : (
                Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="chip">{cat}</span>
                    <span className="text-expense" style={{ fontWeight: 600 }}>AED {fmt(amt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Partner Profit Shares */}
          <div className="card">
            <div className="section-title" style={{ color: '#16a34a', marginBottom: 14 }}>Partner Profit Distribution</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Partner</th><th>Branch</th><th>Ownership</th><th>Branch Profit</th><th>Profit Share</th></tr></thead>
                <tbody>
                  {partnerShares.length === 0 && (
                    <tr><td colSpan={5} style={{ color: '#555', textAlign: 'center', padding: 20 }}>No active partners</td></tr>
                  )}
                  {partnerShares.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: '#C9A84C' }}>{p.branchName}</td>
                      <td style={{ color: '#16a34a' }}>{p.ownership_pct}%</td>
                      <td className={p.branchProfit >= 0 ? 'text-profit' : 'text-expense'}>AED {fmt(p.branchProfit)}</td>
                      <td style={{
                        fontWeight: 700, fontFamily: "'Playfair Display', serif",
                        color: p.share >= 0 ? '#16a34a' : '#D4614E'
                      }}>
                        AED {fmt(p.share)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('ra_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.id && parsed.role) setSession(parsed);
      } catch {}
    }
    setSessionLoaded(true);
  }, []);

  const handleLogin = (user) => {
    setSession(user);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('ra_session');
    setSession(null);
  };

  const navigate = (page) => {
    if (canAccess(session?.role, page)) setCurrentPage(page);
  };

  if (!sessionLoaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0D0D0D' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #2A2A2A', borderTop: '3px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!session) return (
    <>
      <GlobalStyle />
      <LoginPage onLogin={handleLogin} />
    </>
  );

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard user={session} />;
      case 'branches':  return <Branches user={session} />;
      case 'income':    return <EntriesPage user={session} type="income" />;
      case 'expenses':  return <EntriesPage user={session} type="expenses" />;
      case 'partners':  return <Partners user={session} />;
      case 'users':     return <Users user={session} />;
      case 'reports':   return <Reports user={session} />;
      default:          return <Dashboard user={session} />;
    }
  };

  return (
    <>
      <GlobalStyle />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          user={session}
          currentPage={currentPage}
          onNavigate={navigate}
          onLogout={handleLogout}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
        {/* Main Content */}
        <div style={{ flex: 1, marginLeft: 280, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
          className="main-content">
          <style>{`
            @media (max-width: 768px) {
              .main-content { margin-left: 0 !important; }
            }
          `}</style>
          {/* Top Bar */}
          <div style={{
            height: 56, background: '#141414', borderBottom: '1px solid #222',
            display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0
          }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ display: 'none', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 22, padding: 4 }}
              className="hamburger"
            >☰</button>
            <style>{`@media (max-width: 768px) { .hamburger { display: block !important; } }`}</style>
            <span style={{ color: '#C9A84C', fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: 15 }}>
              {navItems.find(n => n.id === currentPage)?.label || 'Dashboard'}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#444' }}>
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          {/* Page Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
            {renderPage()}
          </div>
        </div>
      </div>
    </>
  );
}
