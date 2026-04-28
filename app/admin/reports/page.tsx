export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="card text-sm text-slate-500">
        PDF / Excel exports — coming next iteration. Endpoints will be at{' '}
        <code>/api/reports/pdf</code> and <code>/api/reports/excel</code>.
      </div>
    </div>
  );
}
