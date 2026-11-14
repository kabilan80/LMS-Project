import { useEffect, useState } from 'react';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import { StatusPill } from '../../components/course/courseUi';
import useApi from '../../hooks/useApi';
import { getErrorMessage } from '../../services/api';
import { approveCourse, getCourse, getCourses, rejectCourse } from '../../services/courseService';

export function ApprovalPage() {
  const { data: courses, loaded: coursesLoaded, error: coursesError, callAPI: getCoursesAPI } = useApi(getCourses);
  const loadQueue = () => getCoursesAPI({ status: 'PENDING', pageSize: 50 }).then(() => undefined, () => undefined);
  useEffect(() => { void loadQueue(); }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { loading: approveLoading, callAPI: approveCourseAPI } = useApi(approveCourse);
  const { loading: rejectLoading, callAPI: rejectCourseAPI } = useApi(rejectCourse);
  const busy = approveLoading || rejectLoading;
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const items = courses?.items ?? [];
  // Keep a valid selection as the queue changes.
  useEffect(() => {
    if (items.length === 0) setSelected(null);
    else if (selected === null || !items.some((c) => c.id === selected)) setSelected(items[0]?.id ?? null);
  }, [items, selected]);

  const { data: courseData, loading: courseLoading, error: courseError, callAPI: getCourseAPI, reset: resetCourse } = useApi(getCourse);
  const loadDetail = () => (selected ? getCourseAPI(selected).then(() => undefined, () => undefined) : Promise.resolve());
  useEffect(() => { if (selected) void loadDetail(); else resetCourse(); }, [selected]);

  async function decide(kind: 'approve' | 'reject') {
    if (!selected) return;
    if (kind === 'reject' && reason.trim().length < 3) return setMessage({ type: 'error', text: 'Write a reason so the creator knows what to fix.' });
    setMessage(null);
    try {
      if (kind === 'approve') await approveCourseAPI(selected);
      else await rejectCourseAPI(selected, reason.trim());
    } catch (e) {
      return setMessage({ type: 'error', text: getErrorMessage(e) });
    }
    setMessage({ type: 'ok', text: kind === 'approve' ? 'Course approved and published.' : 'Course sent back with your reason.' });
    setRejecting(false);
    setReason('');
    await loadQueue();
  }

  if (!coursesLoaded && !coursesError) return <LoadingBlock />;
  if (coursesError) return <ErrorBlock message={coursesError} onRetry={() => void loadQueue()} />;

  const course = courseData;
  return (
    <>
      {message && (message.type === 'error' ? <ErrorBlock message={message.text} /> : <div className="card bg-pill-ok-bg text-pill-ok" role="status">{message.text}</div>)}
      {items.length === 0 ? <EmptyState title="Nothing waiting for approval" message="Submitted courses appear here." /> : (
        <div className="grid items-start gap-3 lg:grid-cols-[280px_1fr]">
          <ul className="card flex flex-col gap-1 p-2" aria-label="Courses waiting for approval">
            {items.map((c) => (
              <li key={c.id}>
                <button className={`w-full rounded-nav px-2.5 py-2 text-left ${c.id === selected ? 'bg-pill-in-bg' : 'hover:bg-page'}`} onClick={() => { setSelected(c.id); setRejecting(false); setMessage(null); }}>
                  <b className="block">{c.title}</b>
                  <span className="text-[11px] text-muted">{c.creator.name} · {c.lessonCount} lessons</span>
                </button>
              </li>
            ))}
          </ul>

          <section className="min-w-0">
            {courseLoading && !course ? <LoadingBlock /> : courseError ? <ErrorBlock message={courseError} onRetry={() => void loadDetail()} /> : course && (
              <div className="card">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-[16px] font-bold">{course.title}</h3><StatusPill status={course.status} />
                </div>
                <div className="mb-3 text-muted">{course.category} · {course.level.toLowerCase()} · by {course.creator.name} · pass mark {course.passMark}% · {course.maxAttempts} attempts</div>
                <p className="mb-4 whitespace-pre-wrap">{course.description}</p>

                <h4 className="mb-1 font-heading text-[14px] font-bold">Curriculum</h4>
                {course.modules.map((m) => (
                  <div key={m.id} className="mb-2">
                    <b>{m.order}. {m.title}</b>
                    <ul className="ml-4 list-disc text-muted">
                      {m.lessons.map((l) => (
                        <li key={l.id}>{l.title}{l.isPreview ? ' (preview)' : ''}{l.youtubeUrl && <> · <a className="underline" href={l.youtubeUrl} target="_blank" rel="noreferrer noopener">watch</a></>}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                <h4 className="mb-1 mt-4 font-heading text-[14px] font-bold">Quiz: {course.quiz?.title ?? 'none'}{course.quiz && ` (${course.quiz.timeLimitMinutes} min)`}</h4>
                <ol className="ml-4 list-decimal">
                  {course.quiz?.questions.map((q) => (
                    <li key={q.id} className="mb-1.5">{q.text}
                      <ul className="ml-4 list-none text-muted">
                        {q.options.map((o) => <li key={o.id}>{o.isCorrect ? '✓ ' : '○ '}{o.text}</li>)}
                      </ul>
                    </li>
                  ))}
                </ol>

                {rejecting ? (
                  <div className="mt-4">
                    <label htmlFor="reject-reason" className="mb-[3px] block text-xs font-semibold">Reason for rejection</label>
                    <textarea id="reject-reason" rows={3} className="input mb-2" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn disabled:opacity-60" disabled={busy} style={{ background: '#D64545', color: '#fff', borderColor: '#D64545' }} onClick={() => decide('reject')}>Reject course</button>
                      <button className="btn" onClick={() => setRejecting(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button className="btn btn-primary disabled:opacity-60" disabled={busy} onClick={() => decide('approve')}>Approve and publish</button>
                    <button className="btn" onClick={() => setRejecting(true)}>Reject…</button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
