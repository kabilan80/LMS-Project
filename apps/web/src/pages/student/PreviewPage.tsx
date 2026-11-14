import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LessonPlayer } from '../../components/LessonPlayer';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getLesson } from '../../services/learningService';

/** A free preview lesson for students who have not bought the course yet. Nothing is tracked. */
export function PreviewPage() {
  const params = useParams();
  const courseId = Number(params['courseId']);
  const lessonId = Number(params['lessonId']);
  const { data: lessonData, error: lessonError, callAPI: getLessonAPI } = useApi(getLesson);
  const validId = Number.isInteger(lessonId) && lessonId > 0;
  const load = () => getLessonAPI(lessonId).catch(() => undefined);
  useEffect(() => { if (validId) void load(); }, [lessonId]);

  if (!validId) return <EmptyState title="Lesson not found" />;
  if (!lessonData && !lessonError) return <LoadingBlock />;
  if (lessonError || !lessonData) {
    return (
      <>
        <Link to={`/student/courses/${courseId}`} className="text-navy underline">← Back to course</Link>
        <ErrorBlock message={lessonError ?? 'This preview is not available'} onRetry={() => void load()} />
      </>
    );
  }
  // Students who already have access get the real player instead.
  if (!lessonData.previewOnly) return <Navigate to={`/student/learn/${lessonData.courseId}/${lessonData.id}`} replace />;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <Link to={`/student/courses/${lessonData.courseId}`} className="text-navy underline">← Back to course</Link>
      <LessonPlayer key={lessonData.id} lesson={lessonData} track={false} />
      <div className="card flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[16px] font-bold">{lessonData.title}</h2>
          <span className="text-muted">Free preview · {lessonData.courseTitle}</span>
        </div>
        <Link to={`/student/courses/${lessonData.courseId}`} className="btn btn-gold">Get full access</Link>
      </div>
    </div>
  );
}
