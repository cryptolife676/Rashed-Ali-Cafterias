import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatDate } from '@/lib/utils';
import TransactionForm from './TransactionForm';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const supabase = await createClient();
  const [{ data: txns }, { data: cats }, { data: branches }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, kind, entry_date, amount, notes, is_locked, category:categories(name), branch:branches(name)')
      .order('entry_date', { ascending: false })
      .limit(100),
    supabase.from('categories').select('id, kind, name').eq('is_active', true).order('name'),
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <TransactionForm categories={cats ?? []} branches={branches ?? []} />
      <div className="card">
        <h2 className="font-semibold mb-3">Recent (last 100)</h2>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Kind</th><th>Category</th><th>Branch</th><th className="text-right">Amount</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {(txns ?? []).map((t: any) => (
              <tr key={t.id}>
                <td>{formatDate(t.entry_date)}</td>
                <td><span className={t.kind === 'income' ? 'text-emerald-700' : 'text-red-700'}>{t.kind}</span></td>
                <td>{t.category?.name ?? '—'}</td>
                <td>{t.branch?.name ?? '—'}</td>
                <td className="text-right tabular-nums">{formatMoney(t.amount)}</td>
                <td className="text-slate-500 truncate max-w-xs">{t.notes ?? ''}</td>
                <td>{t.is_locked && <span className="text-xs text-amber-600">locked</span>}</td>
              </tr>
            ))}
            {(txns ?? []).length === 0 && <tr><td colSpan={7} className="text-slate-400 py-6 text-center">No transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
