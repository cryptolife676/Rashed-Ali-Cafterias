'use client';

export default function PortfolioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="card max-w-md text-center space-y-4">
        <div className="text-lg font-semibold text-red-700">Something went wrong</div>
        <p className="text-sm text-slate-500">{error.message}</p>
        <div className="flex gap-3 justify-center">
          <button className="btn-secondary" onClick={reset}>Try again</button>
          <form action="/api/auth/signout" method="post">
            <button className="btn-secondary">Sign out</button>
          </form>
        </div>
      </div>
    </div>
  );
}
