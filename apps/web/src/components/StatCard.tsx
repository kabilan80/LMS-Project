import type { ReactNode } from 'react';

/** KPI card from the designs: small label, big number, one line of context. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="font-heading text-kpi font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
