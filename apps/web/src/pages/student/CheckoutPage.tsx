import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { checkoutSchema, formatMoney, type CheckoutInput, type CheckoutOrder, type CheckoutResult } from '@lms/shared';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { confirmPayment, createCheckout } from '../../services/commerceService';
import { formatDate, PURCHASE_LABEL } from '../../utils/format';

function parseInput(params: URLSearchParams): CheckoutInput | null {
  const type = params.get('type');
  const raw =
    type === 'SINGLE' ? { type, courseId: Number(params.get('courseId')) } :
    type === 'BUNDLE' ? { type, bundleId: Number(params.get('bundleId')) } :
    type === 'ANNUAL' ? { type } : null;
  const parsed = checkoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Payment screen. With the mock provider no money moves: "Pay now" succeeds and "Decline" fails,
 * so both outcomes can be tested. The price shown is the one the server stored for this order.
 */
export function CheckoutPage() {
  const [params] = useSearchParams();
  const input = parseInput(params);
  const [attempt, setAttempt] = useState(0);
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const { error: createError, callAPI: createCheckoutAPI } = useApi(createCheckout);
  const { loading: confirmLoading, error: confirmError, callAPI: confirmPaymentAPI, reset: resetConfirm } = useApi(confirmPayment);
  const busy = confirmLoading;
  const error = confirmError ?? createError;
  const started = useRef(-1); // guards against React StrictMode running the effect twice

  useEffect(() => {
    if (!input || started.current === attempt) return;
    started.current = attempt;
    setOrder(null);
    setResult(null);
    resetConfirm();
    createCheckoutAPI(input).then(setOrder).catch(() => undefined); // checkout.error is set on failure
  }, [attempt, params]);

  async function pay(simulate: 'success' | 'decline') {
    if (!order) return;
    try {
      setResult(await confirmPaymentAPI(order.orderId, simulate));
    } catch {
      // confirm.error is already set
    }
  }

  if (!input) return <EmptyState title="Nothing to pay for" message="Pick a course, bundle or plan first." />;

  if (result) {
    const ok = result.status === 'SUCCEEDED';
    return (
      <div className="card mx-auto max-w-md text-center" role="status">
        <h2 className="font-heading text-lg font-bold">{ok ? 'Payment successful' : 'Payment declined'}</h2>
        <p className="mb-3 mt-1 text-muted">
          {ok
            ? result.type === 'ANNUAL'
              ? `Your annual package is active until ${formatDate(result.endsAt)}.`
              : `You now have access to "${result.title}".`
            : 'You have not been charged. You can try again.'}
        </p>
        <div className="flex justify-center gap-2">
          {ok ? (
            <>
              {result.courseId && <Link className="btn btn-primary" to={`/student/courses/${result.courseId}`}>Go to course</Link>}
              <Link className="btn" to="/student/courses">Browse courses</Link>
              <Link className="btn" to="/student/subscription">My subscription</Link>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
              <Link className="btn" to="/student/subscription">Back to plans</Link>
            </>
          )}
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <>
        <ErrorBlock message={error} />
        <Link to="/student/subscription" className="text-navy underline">← Back to plans</Link>
      </>
    );
  }
  if (!order) return <LoadingBlock />;

  return (
    <div className="mx-auto w-full max-w-md">
      <section className="card flex flex-col gap-3" aria-label="Payment">
        <h2 className="font-heading text-[16px] font-bold">Review and pay</h2>
        {order.testMode && (
          <p className="rounded-nav bg-pill-wa-bg px-2.5 py-1.5 text-pill-wa" role="note">
            Test payment: no real money is charged.
          </p>
        )}
        <div className="flex items-start justify-between gap-3 border-y border-line-soft py-3">
          <div>
            <b className="block">{order.title}</b>
            <span className="text-[11px] text-muted">{PURCHASE_LABEL[order.type]}</span>
          </div>
          <b className="font-heading text-[18px]">{formatMoney(order.amountMinor, order.currency)}</b>
        </div>
        {error && <ErrorBlock message={error} />}
        <button className="btn btn-gold btn-lg justify-center disabled:opacity-60" disabled={busy} onClick={() => pay('success')}>
          {busy ? 'Processing…' : `Pay ${formatMoney(order.amountMinor, order.currency)}`}
        </button>
        {order.testMode && (
          <button className="btn justify-center disabled:opacity-60" disabled={busy} onClick={() => pay('decline')}>
            Simulate a declined payment
          </button>
        )}
        <Link to="/student/subscription" className="text-center text-muted underline">Cancel</Link>
      </section>
    </div>
  );
}
