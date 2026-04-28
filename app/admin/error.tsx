'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 text-center space-y-4">
      <div className="text-lg font-semibold text-red-700">Page error</div>
      <p className="text-sm text-slate-500">{error.message}</p>
      <button className="btn-secondary" onClick={reset}>Try again</button>
    </div>
  );
}
