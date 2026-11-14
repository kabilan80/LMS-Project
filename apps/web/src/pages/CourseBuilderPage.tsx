import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AssignmentsEditor } from '../components/course/AssignmentsEditor';
import { CourseInfoForm } from '../components/course/CourseInfoForm';
import { CurriculumEditor } from '../components/course/CurriculumEditor';
import { QuizEditor } from '../components/course/QuizEditor';
import { StatusPill } from '../components/course/courseUi';
import { ErrorBlock, LoadingBlock } from '../components/Status';
import useApi from '../hooks/useApi';
import { getCourse, publishCourse, submitCourse, unpublishCourse } from '../services/courseService';
import { useAuthStore } from '../store/authStore';

/** One builder for instructors and the admin. The server decides who may edit (owner or admin). */
export function CourseBuilderPage() {
  const id = Number(useParams()['id']);
  const role = useAuthStore((s) => s.user?.role);
  const backTo = role === 'ADMIN' ? '/admin/courses' : '/instructor/courses';
  const { data: courseData, loading: courseLoading, loaded: courseLoaded, error: courseError, callAPI: getCourseAPI } = useApi(getCourse);
  const { loading: publishLoading, error: publishError, callAPI: publishCourseAPI } = useApi(publishCourse);
  const { loading: submitLoading, error: submitError, callAPI: submitCourseAPI } = useApi(submitCourse);
  const { loading: unpublishLoading, error: unpublishError, callAPI: unpublishCourseAPI } = useApi(unpublishCourse);
  const refetch = () => getCourseAPI(id).then(() => undefined).catch(() => undefined);
  useEffect(() => {
    if (Number.isInteger(id) && id > 0) getCourseAPI(id).catch(() => undefined);
  }, [id, getCourseAPI]);
  const busy = publishLoading || submitLoading || unpublishLoading;
  const actionError = publishError ?? submitError ?? unpublishError;

  if (!Number.isInteger(id) || id <= 0) return <ErrorBlock message="Invalid course link" />;
  if ((!courseLoaded && !courseError) || (courseLoading && !courseData)) return <LoadingBlock />;
  if (courseError) return <ErrorBlock message={courseError} onRetry={refetch} />;
  if (!courseData) return null;

  const isAdmin = role === 'ADMIN';
  const publishable = isAdmin && courseData.canEdit && courseData.status !== 'PUBLISHED';
  const submittable = !isAdmin && courseData.canEdit && (courseData.status === 'DRAFT' || courseData.status === 'REJECTED');

  async function reloadAfter(call: () => Promise<unknown>) {
    try {
      await call();
    } catch {
      return; // the action's error is shown below
    }
    await refetch();
  }
  const publish = () => { if (courseData) void reloadAfter(() => publishCourseAPI(courseData.id)); };
  const submit = () => { if (courseData) void reloadAfter(() => submitCourseAPI(courseData.id)); };
  const unpublish = () => {
    if (!courseData || !window.confirm('Unpublish this course? Students will no longer see it. It returns to draft.')) return;
    void reloadAfter(() => unpublishCourseAPI(courseData.id));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link to={backTo} className="text-muted underline">← Back to courses</Link>
        <h2 className="font-heading text-[18px] font-bold">{courseData.title}</h2>
        <StatusPill status={courseData.status} />
        {publishable && (
          <button className="btn btn-gold ml-auto disabled:opacity-60" disabled={busy} onClick={publish}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        )}
        {submittable && (
          <button className="btn btn-gold ml-auto disabled:opacity-60" disabled={busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Submit for approval'}
          </button>
        )}
        {!isAdmin && courseData.status === 'PENDING' && (
          <button className="btn ml-auto" disabled>Waiting for approval</button>
        )}
        {isAdmin && courseData.canEdit && courseData.status === 'PUBLISHED' && (
          <button className="btn ml-auto disabled:opacity-60" disabled={busy} onClick={unpublish}>Unpublish</button>
        )}
      </div>

      {actionError && <ErrorBlock message={actionError} />}
      {courseData.status === 'REJECTED' && courseData.rejectionReason && (
        <div className="card border-pill-bad-bg bg-pill-bad-bg text-pill-bad" role="status">
          <b className="block">Changes requested</b>{courseData.rejectionReason}
        </div>
      )}
      {courseData.status === 'PENDING' && !isAdmin && (
        <div className="card bg-pill-wa-bg text-pill-wa" role="status">Submitted. The admin will review this course and approve it or send it back with feedback.</div>
      )}
      {courseData.status === 'PUBLISHED' && courseData.canEdit && (
        <div className="card bg-pill-ok-bg text-pill-ok" role="status">This course is live. Students can see it, and your changes are saved straight away.</div>
      )}

      <CourseInfoForm course={courseData} onSaved={refetch} />
      <CurriculumEditor course={courseData} onChanged={refetch} />
      <AssignmentsEditor course={courseData} onChanged={refetch} />
      <QuizEditor course={courseData} onSaved={refetch} />
    </>
  );
}
