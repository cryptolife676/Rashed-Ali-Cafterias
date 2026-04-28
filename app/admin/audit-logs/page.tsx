import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, action, table_name, row_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Logs</h1>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Table</th><th>Row</th></tr></thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td className="font-mono text-xs text-slate-500">{l.actor_id ?? '—'}</td>
                <td>{l.action}</td>
                <td>{l.table_name}</td>
                <td className="font-mono text-xs text-slate-500">{l.row_id}</td>
              </tr>
            ))}
            {(logs ?? []).length === 0 && <tr><td colSpan={5} className="text-slate-400 py-6 text-center">Nothing logged yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
