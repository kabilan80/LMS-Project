import { useEffect, useState, type FormEvent } from 'react';
import { formatMoney, toMajor, toMinor, type PlanItem } from '@lms/shared';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Pill } from '../../components/Pill';
import { ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getPlans, getPurchases, updatePlan } from '../../services/commerceService';
import { formatDate, PURCHASE_LABEL } from '../../utils/format';

/** One plan as a card. Price is typed in whole currency units (999.50) and stored in minor units (99950). */
function PlanCard({ plan, onSaved }: { plan: PlanItem; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(toMajor(plan.priceMinor, plan.currency)));
  const [localError, setError] = useState<string | null>(null);
  const { loading: updateLoading, error: updateError, callAPI: updatePlanAPI, reset: resetUpdate } = useApi(updatePlan);
  const busy = updateLoading;
  const error = localError ?? updateError;

  function startEdit() {
    setName(plan.name);
    setPrice(String(toMajor(plan.priceMinor, plan.currency)));
    setError(null);
    resetUpdate();
    setEditing(true);
  }

  async function save(patch: { name?: string; priceMinor?: number; active?: boolean }) {
    setError(null);
    try {
      await updatePlanAPI(plan.type, patch);
      setEditing(false);
      onSaved();
    } catch {
      /* update.error is shown in the card */
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(price);
    if (!name.trim()) return setError('Enter a name');
    if (price.trim() === '' || !Number.isFinite(n) || n < 0) return setError('Enter a valid price');
    void save({ name: name.trim(), priceMinor: toMinor(n, plan.currency) });
  }

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-muted">{plan.type === 'SINGLE' ? 'Covers 1 course' : 'All courses, 12 months'}</div>
          {!editing && <b className="font-heading text-[15px]">{plan.name}</b>}
        </div>
        <Pill tone={plan.active ? 'ok' : 'bad'}>{plan.active ? 'Active' : 'Off'}</Pill>
      </div>
      {editing ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-1">
          <Field id={`plan-${plan.type}-name`} label="Plan name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field id={`plan-${plan.type}-price`} label={`Price (${plan.currency})`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          {error && <p className="text-[11px] text-danger" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="font-heading text-kpi font-bold">{formatMoney(plan.priceMinor, plan.currency)}</div>
          {error && <p className="text-[11px] text-danger" role="alert">{error}</p>}
          <div className="mt-auto flex gap-2">
            <button type="button" className="btn" onClick={startEdit}>Edit</button>
            <button type="button" className="btn disabled:opacity-60" disabled={busy} onClick={() => void save({ active: !plan.active })}>{plan.active ? 'Turn off' : 'Turn on'}</button>
          </div>
        </>
      )}
    </div>
  );
}

const PURCHASE_STATUS = {
  ACTIVE: { tone: 'ok', label: 'Active' },
  EXPIRED: { tone: 'bad', label: 'Expired' },
  REFUNDED: { tone: 'wait', label: 'Refunded' },
  PENDING: { tone: 'info', label: 'Pending' },
  FAILED: { tone: 'bad', label: 'Failed' },
} as const;

/** Just the two plans (editable) and who bought what recently. */
export function PlansPage() {
  const { data: plansData, loaded: plansLoaded, error: plansError, callAPI: getPlansAPI } = useApi(getPlans);
  const loadPlans = () => getPlansAPI().then(() => undefined, () => undefined);
  const [page, setPage] = useState(1);
  const { data: purchasesData, loaded: purchasesLoaded, error: purchasesError, callAPI: getPurchasesAPI } = useApi(getPurchases);
  const loadPurchases = () => getPurchasesAPI(page).then(() => undefined, () => undefined);
  useEffect(() => { void loadPlans(); }, []);
  useEffect(() => { void loadPurchases(); }, [page]);

  if (!plansLoaded && !plansError) return <LoadingBlock />;
  if (plansError && !plansData) return <ErrorBlock message={plansError} onRetry={loadPlans} />;

  return (
    <>
      <section aria-label="Plans">
        <h3 className="font-heading text-[14px] font-bold">Plans</h3>
        <p className="mb-2 text-muted">A price change only affects new purchases. Existing students keep what they paid for.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {(plansData ?? []).map((p) => <PlanCard key={p.id} plan={p} onSaved={() => void loadPlans()} />)}
        </div>
      </section>

      <section className="card overflow-x-auto p-0" aria-label="Recent purchases">
        <h3 className="px-3.5 pt-3 font-heading text-[14px] font-bold">Recent purchases</h3>
        {!purchasesLoaded && !purchasesError ? <p className="px-3.5 py-3 text-muted">Loading…</p> : purchasesError ? <div className="p-3"><ErrorBlock message={purchasesError} onRetry={loadPurchases} /></div> :
          !purchasesData || purchasesData.items.length === 0 ? <p className="px-3.5 py-3 text-muted">No purchases yet.</p> : (
          <>
            <table className="mt-2 w-full min-w-[760px] text-left">
              <thead><tr className="border-b border-line text-muted">
                <th className="px-3.5 py-2 font-semibold">Student</th><th className="px-3.5 py-2 font-semibold">Purchased</th><th className="px-3.5 py-2 font-semibold">Plan</th>
                <th className="px-3.5 py-2 font-semibold">Amount</th><th className="px-3.5 py-2 font-semibold">Status</th><th className="px-3.5 py-2 font-semibold">Date</th>
              </tr></thead>
              <tbody>
                {purchasesData.items.map((p) => {
                  const st = PURCHASE_STATUS[p.status];
                  return (
                    <tr key={p.id} className="border-b border-line-soft last:border-0">
                      <td className="px-3.5 py-2"><b className="block">{p.student?.name}</b><span className="text-muted">{p.student?.email}</span></td>
                      <td className="px-3.5 py-2">{p.title}</td>
                      <td className="px-3.5 py-2"><Pill tone="info">{PURCHASE_LABEL[p.type]}</Pill></td>
                      <td className="px-3.5 py-2 font-semibold">{formatMoney(p.amountMinor, p.currency)}</td>
                      <td className="px-3.5 py-2"><Pill tone={st.tone}>{st.label}{p.status === 'ACTIVE' && p.endsAt ? ` · until ${formatDate(p.endsAt)}` : ''}</Pill></td>
                      <td className="px-3.5 py-2 text-muted">{formatDate(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3.5 pb-3"><Pagination page={page} pageSize={purchasesData.pageSize} total={purchasesData.total} onChange={setPage} /></div>
          </>
        )}
      </section>
    </>
  );
}
