import { EmptyState } from './EmptyState';

/** Same look for loading and error states everywhere. */
export function LoadingBlock() {
  return <div className="card py-8 text-center text-muted" role="status">Loading…</div>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-center justify-between border-pill-bad-bg bg-pill-bad-bg text-pill-bad" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export { EmptyState };
