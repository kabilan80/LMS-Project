import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Brand } from '../components/Icon';
import useApi from '../hooks/useApi';
import { verifyCertificate } from '../services/learningService';
import { formatDate } from '../utils/format';

/** Public page: anyone with a certificate ID can check it. No sign-in needed. */
export function VerifyPage() {
  const code = (useParams()['code'] ?? '').trim();
  const { data: verifyResult, loaded: verifyLoaded, error: verifyError, callAPI: verifyCertificateAPI } = useApi(verifyCertificate);
  const refetch = () => verifyCertificateAPI(code).then(() => undefined).catch(() => undefined);
  useEffect(() => { void refetch(); }, [code]);

  return (
    <main className="grid min-h-screen place-items-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-center"><Brand className="!text-navy" /></div>
        <section className="card text-center" aria-live="polite">
          <h1 className="font-heading text-[18px] font-bold">Certificate verification</h1>
          <p className="mb-3 font-mono text-[12px] text-muted">{code}</p>
          {!verifyLoaded && !verifyError ? <p className="text-muted">Checking…</p> : verifyError ? (
            <div role="alert" className="text-pill-bad">{verifyError} <button className="btn ml-2" onClick={refetch}>Retry</button></div>
          ) : verifyResult?.valid ? (
            <div className="rounded-card border border-pill-ok-bg bg-pill-ok-bg p-4 text-left">
              <b className="mb-2 block text-pill-ok">✔ This certificate is valid</b>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1">
                <dt className="text-muted">Awarded to</dt><dd className="font-semibold">{verifyResult.studentName}</dd>
                <dt className="text-muted">Course</dt><dd className="font-semibold">{verifyResult.courseTitle}</dd>
                <dt className="text-muted">Status</dt><dd>{verifyResult.status}</dd>
                <dt className="text-muted">Issued</dt><dd>{formatDate(verifyResult.issuedAt)}</dd>
              </dl>
            </div>
          ) : (
            <div role="alert" className="rounded-card bg-pill-bad-bg p-4 text-pill-bad">
              <b className="block">No certificate found</b>Check the ID and try again.
            </div>
          )}
        </section>
        <p className="mt-3 text-center"><Link to="/" className="text-navy underline">Go to LearnHub</Link></p>
      </div>
    </main>
  );
}
