import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney } from '@lms/shared';
import { Pill } from '../../components/Pill';
import { ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getBundles, getMyAccess, getPlans } from '../../services/commerceService';
import { formatDate } from '../../utils/format';

/** Plans and ways to buy, nothing else. */
export function SubscriptionPage() {
  const navigate = useNavigate();
  const { data: plansData, error: plansError, callAPI: getPlansAPI } = useApi(getPlans);
  const { data: bundlesData, error: bundlesError, callAPI: getBundlesAPI } = useApi(getBundles);
  const { data: myAccessData, error: myAccessError, callAPI: getMyAccessAPI } = useApi(getMyAccess);
  const loadAll = () => {
    getPlansAPI().catch(() => undefined);
    getBundlesAPI().catch(() => undefined);
    getMyAccessAPI().catch(() => undefined);
  };
  useEffect(loadAll, []);

  const failure = plansError ?? myAccessError ?? bundlesError;
  if (failure) return <ErrorBlock message={failure} onRetry={loadAll} />;
  if (!plansData || !myAccessData) return <LoadingBlock />;

  const single = plansData?.find((p) => p.type === 'SINGLE');
  const annual = plansData?.find((p) => p.type === 'ANNUAL');
  const annualEnds = myAccessData?.annual?.endsAt;
  const hasAnnual = !!myAccessData?.annual;
  const shownBundles = bundlesData ?? [];

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {single && (
          <section className="card flex flex-col gap-2" aria-label="Single course">
            <h3 className="font-heading text-[14px] font-bold">{single.name}</h3>
            <div className="font-heading text-[26px] font-bold">{formatMoney(single.priceMinor, single.currency)}</div>
            <p className="text-muted">One course of your choice.</p>
            <ul><li>✔ Lifetime access to that course</li><li>✔ Quiz and certificate</li></ul>
            <Link to="/student/courses" className="btn btn-primary mt-auto justify-center">Choose a course</Link>
          </section>
        )}
        {annual && (
          <section className="card flex flex-col gap-2 border-2 border-gold" aria-label="Annual package">
            <div><Pill tone="wait">Best value</Pill></div>
            <h3 className="font-heading text-[14px] font-bold">{annual.name}</h3>
            <div className="font-heading text-[26px] font-bold">{formatMoney(annual.priceMinor, annual.currency)}</div>
            <p className="text-muted">All courses for 12 months.</p>
            <ul><li>✔ Every published course</li><li>✔ New courses included</li><li>✔ Quiz and certificate</li></ul>
            <button className="btn btn-gold mt-auto justify-center disabled:opacity-60" disabled={hasAnnual} onClick={() => navigate('/student/checkout?type=ANNUAL')}>
              {hasAnnual ? `Active until ${formatDate(annualEnds)}` : 'Subscribe yearly'}
            </button>
          </section>
        )}
      </div>

      {shownBundles.length > 0 && (
        <section aria-label="Course bundles">
          <h3 className="mb-2 font-heading text-[14px] font-bold">Course bundles</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {shownBundles.map((b) => (
              <div key={b.id} className="card flex flex-col gap-1.5">
                <b>{b.name}</b>
                <div className="font-heading text-[20px] font-bold">{formatMoney(b.priceMinor, b.currency)}</div>
                <ul className="text-muted">{b.courses.map((c) => <li key={c.id}>• {c.title}</li>)}</ul>
                <button className="btn btn-primary mt-auto justify-center disabled:opacity-60" disabled={b.owned} onClick={() => navigate(`/student/checkout?type=BUNDLE&bundleId=${b.id}`)}>
                  {b.owned ? 'You have all these courses' : 'Buy bundle'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
