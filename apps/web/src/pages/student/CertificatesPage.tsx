import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CERTIFICATE_MIN_PERCENT, MAX_ASSIGNMENT_MARKS, type CertificateProgress, type CertificateRow, type ProgressState } from '@lms/shared';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { downloadCertificate, getCertificateProgress, getCertificates } from '../../services/learningService';
import { formatDate } from '../../utils/format';

function CertificateCard({ c, onError }: { c: CertificateRow; onError: (m: string) => void }) {
  const { loading: downloadLoading, callAPI: downloadCertificateAPI } = useApi(downloadCertificate);
  const busy = downloadLoading;
  const [copied, setCopied] = useState(false);
  const verifyUrl = `${window.location.origin}/verify/${c.code}`;

  async function download() {
    try {
      await downloadCertificateAPI(c);
      onError('');
    } catch {
      onError('Could not download the certificate. Please try again.');
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="card flex flex-col gap-3">
      {/* Preview in the same style as the PDF: navy frame with a gold inner line. */}
      <div className="rounded-card border-[6px] border-navy bg-white p-1.5">
        <div className="rounded-ctl border border-gold px-4 py-6 text-center">
          <div className="text-[10px] font-bold tracking-[0.3em] text-gold">LEARNHUB</div>
          <div className="font-heading text-[20px] font-bold text-navy">Certificate of Completion</div>
          <div className="mt-2 text-muted">This certifies that</div>
          <div className="font-heading text-[20px] font-bold">{c.studentName}</div>
          <div className="mt-1 text-muted">has successfully completed</div>
          <div className="font-heading text-[16px] font-bold text-navy">{c.courseTitle}</div>
          <div className="mt-1"><span className="pill pill-ok">{c.status}</span> · {formatDate(c.issuedAt)}</div>
          <div className="mt-2 font-mono text-[11px] text-muted">ID {c.code}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary disabled:opacity-60" disabled={busy} onClick={download}>{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button className="btn" onClick={copy}>{copied ? 'Link copied' : 'Copy verify link'}</button>
        <a className="text-navy underline" href={`/verify/${c.code}`} target="_blank" rel="noreferrer noopener">Open verify page</a>
      </div>
    </article>
  );
}

const STATE_ICON: Record<ProgressState, { mark: string; cls: string; label: string }> = {
  done: { mark: '✓', cls: 'bg-pill-ok-bg text-pill-ok', label: 'Done' },
  pending: { mark: '○', cls: 'bg-track text-muted', label: 'Pending' },
  failed: { mark: '✕', cls: 'bg-pill-bad-bg text-pill-bad', label: 'Below the requirement' },
  na: { mark: '–', cls: 'bg-track text-muted', label: 'Not required' },
};

function Step({ state, title, detail }: { state: ProgressState; title: string; detail: string }) {
  const icon = STATE_ICON[state];
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${icon.cls}`} role="img" aria-label={icon.label}>{icon.mark}</span>
      <div className="min-w-0">
        <b className="block">{title}</b>
        <span className={state === 'failed' ? 'text-pill-bad' : 'text-muted'}>{detail}</span>
      </div>
    </li>
  );
}

const STATUS_PILL = {
  ACCOMPLISHED: { tone: 'pill-ok', label: 'Accomplished' },
  IN_PROGRESS: { tone: 'pill-wait', label: 'In progress' },
  NOT_ELIGIBLE: { tone: 'pill-bad', label: 'Not eligible' },
} as const;

/** One course: what is done, what is pending, and the scores so far, ending with the next thing to do. */
function ProgressCard({ p, onError }: { p: CertificateProgress; onError: (m: string) => void }) {
  const { loading: downloadLoading, callAPI: downloadCertificateAPI } = useApi(downloadCertificate);
  const pill = STATUS_PILL[p.status];
  const { lessons, quiz, assignments } = p;

  const quizDetail = !quiz.exists ? 'The final quiz is not ready yet'
    : quiz.bestPercent === null ? (lessons.state === 'done' ? 'Not attempted yet. The quiz is unlocked' : 'Unlocks after you complete every lesson')
    : quiz.state === 'done' ? `Your best score: ${quiz.bestPercent}%`
    : quiz.state === 'failed' ? `Your best score: ${quiz.bestPercent}%. Below ${CERTIFICATE_MIN_PERCENT}% and no attempts left`
    : `Your best score: ${quiz.bestPercent}%. You need ${CERTIFICATE_MIN_PERCENT}% or more (attempt ${quiz.attemptsUsed} of ${quiz.maxAttempts} used)`;
  const assignmentDetail = assignments.required === 0 ? 'No assignments in this course'
    : assignments.state === 'done' ? `Average marks: ${assignments.averagePercent}/${MAX_ASSIGNMENT_MARKS} · ${assignments.accepted} of ${assignments.required} accepted`
    : assignments.state === 'failed' ? (assignments.accepted === assignments.required ? `Average marks: ${assignments.averagePercent}/${MAX_ASSIGNMENT_MARKS}. Below ${CERTIFICATE_MIN_PERCENT}%, so no certificate can be issued` : 'An assignment was not passed within its allowed attempts, so no certificate can be issued')
    : `${assignments.accepted} of ${assignments.required} accepted by your instructor${assignments.averagePercent !== null ? ` · marks so far: ${assignments.averagePercent}/${MAX_ASSIGNMENT_MARKS}` : ''}`;

  async function download() {
    if (!p.certificateId || !p.certificateCode) return;
    try {
      await downloadCertificateAPI({ id: p.certificateId, code: p.certificateCode });
      onError('');
    } catch {
      onError('Could not download the certificate. Please try again.');
    }
  }

  const next = lessons.state !== 'done' ? { to: `/student/learn/${p.courseId}`, label: 'Continue learning' }
    : quiz.state === 'pending' && quiz.exists ? { to: `/student/quiz/${p.courseId}`, label: 'Take the final quiz' }
    : assignments.state === 'pending' ? { to: '/student/assignments', label: 'Go to assignments' }
    : null;

  return (
    <article className="card flex flex-col gap-3" aria-label={`Certificate progress for ${p.courseTitle}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-heading text-[15px] font-bold">{p.courseTitle}</h4>
          <span className="text-[11px] text-muted">To earn the certificate: complete the lessons, then score {CERTIFICATE_MIN_PERCENT}% or more in the quiz and in the assignments.</span>
        </div>
        <span className={`pill ${pill.tone}`}>{pill.label}</span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Progress</span><span>{p.stepsDone} of 3 steps complete</span></div>
        <ProgressBar value={p.stepsDone} max={3} label={`${p.courseTitle} certificate progress`} />
      </div>
      <ul className="flex flex-col gap-2.5">
        <Step state={lessons.state} title="Complete all lessons" detail={`${lessons.done} of ${lessons.total} lessons completed`} />
        <Step state={quiz.state} title={`Pass the final quiz (${CERTIFICATE_MIN_PERCENT}% or more)`} detail={quizDetail} />
        <Step state={assignments.state} title={`Assignments accepted (${CERTIFICATE_MIN_PERCENT}% or more on average)`} detail={assignmentDetail} />
      </ul>
      {p.status === 'NOT_ELIGIBLE' && (
        <p className="rounded-nav bg-pill-bad-bg px-2.5 py-2 text-pill-bad" role="status">A certificate needs {CERTIFICATE_MIN_PERCENT}% or more in both the quiz and the assignments, so none will be issued for this course.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {p.status === 'ACCOMPLISHED' ? (
          <>
            <button className="btn btn-primary disabled:opacity-60" disabled={downloadLoading} onClick={download}>{downloadLoading ? 'Preparing…' : 'Download certificate'}</button>
            <span className="text-pill-ok">Congratulations, you have accomplished this course.</span>
          </>
        ) : p.status === 'IN_PROGRESS' && next ? (
          <Link to={next.to} className="btn btn-gold">{next.label}</Link>
        ) : null}
      </div>
    </article>
  );
}

export function CertificatesPage() {
  const { data: certificatesData, error: certificatesError, callAPI: getCertificatesAPI } = useApi(getCertificates);
  const { data: progressData, error: progressError, callAPI: getProgressAPI } = useApi(getCertificateProgress);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const load = () => Promise.all([getCertificatesAPI().catch(() => undefined), getProgressAPI().catch(() => undefined)]);
  useEffect(() => { void load(); }, []);

  if ((!certificatesData && !certificatesError) || (!progressData && !progressError)) return <LoadingBlock />;
  if (certificatesError || progressError) return <ErrorBlock message={certificatesError ?? progressError ?? ''} onRetry={() => void load()} />;
  const progress = progressData ?? [];
  const certificates = certificatesData ?? [];
  return (
    <>
      <p className="text-muted">Anyone can check a certificate with its ID on the verify page. <Link to="/student/courses?scope=mine" className="text-navy underline">Back to my courses</Link></p>
      {downloadError && <ErrorBlock message={downloadError} />}

      <section className="flex flex-col gap-2" aria-label="Certificate progress">
        <h3 className="font-heading text-[14px] font-bold">Your progress toward certificates</h3>
        {progress.length === 0 ? (
          <EmptyState title="No courses yet" message="Get access to a course and finish its lessons, quiz and assignments to earn a certificate." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {progress.map((p) => <ProgressCard key={p.courseId} p={p} onError={setDownloadError} />)}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Your certificates">
        <h3 className="font-heading text-[14px] font-bold">Your certificates</h3>
        {certificates.length === 0 ? (
          <EmptyState title="No certificates yet" message="Finish all lessons, then pass the final quiz and your assignments with 70% or more in both to earn one." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {certificates.map((c) => <CertificateCard key={c.id} c={c} onError={setDownloadError} />)}
          </div>
        )}
      </section>
    </>
  );
}
