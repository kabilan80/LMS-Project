import { useState } from 'react';
import { courseAssignmentInputSchema, type CourseAssignmentDetail, type CourseAssignmentInput, type CourseDetail } from '@lms/shared';
import { Field } from '../Field';
import useApi from '../../hooks/useApi';
import {
  createCourseAssignment,
  deleteCourseAssignment,
  reorderCourseAssignments,
  updateCourseAssignment,
} from '../../services/courseService';
import { log } from '../../utils/log';

interface Props {
  course: CourseDetail;
  onChanged: () => void | Promise<void>;
}

const move = <T,>(arr: T[], from: number, to: number): T[] => {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

type FormValue = { title: string; description: string };

/** Assignments for this course, added like modules. Students submit a PDF for each; the certificate waits for the instructor to accept them. */
export function AssignmentsEditor({ course, onChanged }: Props) {
  const locked = !course.canEdit;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { error: createError, reset: resetCreate, callAPI: createAPI } = useApi(createCourseAssignment);
  const { error: updateError, reset: resetUpdate, callAPI: updateAPI } = useApi(updateCourseAssignment);
  const { error: deleteError, reset: resetDelete, callAPI: deleteAPI } = useApi(deleteCourseAssignment);
  const { error: reorderError, reset: resetReorder, callAPI: reorderAPI } = useApi(reorderCourseAssignments);
  const error = createError || updateError || deleteError || reorderError || null;

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    resetCreate(); resetUpdate(); resetDelete(); resetReorder();
    try {
      await action();
    } catch {
      return false; // the message is in that action's .error
    }
    await onChanged();
    return true;
  }

  const list = course.assignments;
  return (
    <section className="card" aria-label="Assignments">
      <h5 className="mb-1 font-heading text-[14px] font-bold">Assignments</h5>
      <p className="mb-3 text-muted">
        Students submit a PDF for each assignment. Their certificate is issued only after they pass the quiz and you accept every assignment.
      </p>
      {error && <div role="alert" className="mb-3 rounded-ctl bg-pill-bad-bg px-3 py-2 text-pill-bad">{error}</div>}

      {list.length === 0 && <p className="mb-3 text-muted">No assignments yet. The certificate then needs only the quiz.</p>}

      <div className="flex flex-col gap-3">
        {list.map((a, i) => (
          <div key={a.id} className="rounded-ctl border border-line">
            {editingId === a.id ? (
              <AssignmentForm initial={{ title: a.title, description: a.description ?? '' }} submitLabel="Save assignment"
                onSubmit={async (v) => { log('AssignmentsEditor', `save assignment ${a.id}`, v); if (await run(() => updateAPI(a.id, v))) setEditingId(null); }}
                onCancel={() => setEditingId(null)} />
            ) : (
              <Row a={a} index={i} total={list.length} locked={locked}
                onEdit={() => setEditingId(a.id)}
                onUp={() => run(() => reorderAPI(course.id, move(list, i, i - 1).map((x) => x.id)))}
                onDown={() => run(() => reorderAPI(course.id, move(list, i, i + 1).map((x) => x.id)))}
                onDelete={() => { if (window.confirm(`Delete assignment "${a.title}"?`)) void run(() => deleteAPI(a.id)); }} />
            )}
          </div>
        ))}
      </div>

      {!locked && (
        <div className="mt-3">
          {adding ? (
            <div className="rounded-ctl border border-line">
              <AssignmentForm initial={{ title: '', description: '' }} submitLabel="Add assignment"
                onSubmit={async (v) => { log('AssignmentsEditor', 'add assignment', v); if (await run(() => createAPI(course.id, v))) setAdding(false); }}
                onCancel={() => setAdding(false)} />
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add assignment</button>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ a, index, total, locked, onEdit, onUp, onDown, onDelete }: {
  a: CourseAssignmentDetail; index: number; total: number; locked: boolean;
  onEdit: () => void; onUp: () => void; onDown: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-pill-in-bg text-[11px] font-bold text-navy">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{a.title}</b>
        {a.description && <span className="block whitespace-pre-line text-[11px] text-muted">{a.description}</span>}
      </span>
      {!locked && (
        <div className="flex gap-1.5">
          <button className="btn" disabled={index === 0} aria-label="Move assignment up" onClick={onUp}>↑</button>
          <button className="btn" disabled={index === total - 1} aria-label="Move assignment down" onClick={onDown}>↓</button>
          <button className="btn" onClick={onEdit}>Edit</button>
          <button className="btn text-danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
}

function AssignmentForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: FormValue; submitLabel: string; onSubmit: (v: CourseAssignmentInput) => void | Promise<void>; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<Record<string, string>>({});
  async function go() {
    const parsed = courseAssignmentInputSchema.safeParse(v);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setErr(errs);
    }
    setErr({});
    await onSubmit(parsed.data);
  }
  return (
    <div className="px-3 py-2">
      <Field label="Assignment title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={err['title']} />
      <label htmlFor="assignment-description" className="mb-[3px] block text-xs font-semibold">What should students submit? (optional)</label>
      <textarea id="assignment-description" rows={3} className="input mb-2" maxLength={2000} value={v.description}
        onChange={(e) => setV({ ...v, description: e.target.value })} />
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={go}>{submitLabel}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
