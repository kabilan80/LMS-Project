import { useState } from 'react';
import { lessonInputSchema, moduleInputSchema, type CourseDetail, type LessonDetail } from '@lms/shared';
import { Field } from '../Field';
import useApi from '../../hooks/useApi';
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  reorderLessons,
  reorderModules,
  updateLesson,
  updateModule,
} from '../../services/courseService';

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

export function CurriculumEditor({ course, onChanged }: Props) {
  const locked = !course.canEdit;
  const [localError, setError] = useState<string | null>(null);
  const [newModule, setNewModule] = useState('');
  const { error: createModuleError, reset: resetCreateModule, callAPI: createModuleAPI } = useApi(createModule);
  const { error: updateModuleError, reset: resetUpdateModule, callAPI: updateModuleAPI } = useApi(updateModule);
  const { error: reorderModulesError, reset: resetReorderModules, callAPI: reorderModulesAPI } = useApi(reorderModules);
  const { error: deleteModuleError, reset: resetDeleteModule, callAPI: deleteModuleAPI } = useApi(deleteModule);
  const { error: reorderLessonsError, reset: resetReorderLessons, callAPI: reorderLessonsAPI } = useApi(reorderLessons);
  const { error: deleteLessonError, reset: resetDeleteLesson, callAPI: deleteLessonAPI } = useApi(deleteLesson);
  const { error: updateLessonError, reset: resetUpdateLesson, callAPI: updateLessonAPI } = useApi(updateLesson);
  const { error: createLessonError, reset: resetCreateLesson, callAPI: createLessonAPI } = useApi(createLesson);
  const error = localError ?? (createModuleError || updateModuleError || reorderModulesError || deleteModuleError || reorderLessonsError || deleteLessonError || updateLessonError || createLessonError || null);
  const clearErrors = () => {
    setError(null);
    resetCreateModule();
    resetUpdateModule();
    resetReorderModules();
    resetDeleteModule();
    resetReorderLessons();
    resetDeleteLesson();
    resetUpdateLesson();
    resetCreateLesson();
  };

  /** Runs a change (through its useApi), shows the error if any, then reloads the course. */
  async function attempt(action: () => Promise<unknown>): Promise<boolean> {
    clearErrors();
    try {
      await action();
    } catch {
      return false; // the message is in that action's .error
    }
    await onChanged();
    return true;
  }
  async function run(action: () => Promise<unknown>): Promise<void> {
    await attempt(action);
  }

  async function addModule() {
    const parsed = moduleInputSchema.safeParse({ title: newModule });
    if (!parsed.success) return setError('Enter a module title');
    if (await attempt(() => createModuleAPI(course.id, parsed.data.title))) setNewModule('');
  }

  return (
    <section className="card" aria-label="Curriculum">
      <h5 className="mb-2 font-heading text-[14px] font-bold">Modules and lessons</h5>
      {error && <div role="alert" className="mb-3 rounded-ctl bg-pill-bad-bg px-3 py-2 text-pill-bad">{error}</div>}

      {course.modules.length === 0 && <p className="mb-3 text-muted">No modules yet. Add the first one below.</p>}

      <div className="flex flex-col gap-3">
        {course.modules.map((m, mi) => (
          <div key={m.id} className="rounded-ctl border border-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-page px-3 py-2">
              <ModuleTitle title={m.title} locked={locked} onSave={(t) => run(() => updateModuleAPI(m.id, t))} />
              {!locked && (
                <div className="ml-auto flex gap-1.5">
                  <button className="btn" disabled={mi === 0} aria-label="Move module up"
                    onClick={() => run(() => reorderModulesAPI(course.id, move(course.modules, mi, mi - 1).map((x) => x.id)))}>↑</button>
                  <button className="btn" disabled={mi === course.modules.length - 1} aria-label="Move module down"
                    onClick={() => run(() => reorderModulesAPI(course.id, move(course.modules, mi, mi + 1).map((x) => x.id)))}>↓</button>
                  <button className="btn text-danger" onClick={() => { if (window.confirm(`Delete module "${m.title}" and its lessons?`)) void run(() => deleteModuleAPI(m.id)); }}>Delete</button>
                </div>
              )}
            </div>
            <ul className="divide-y divide-line-soft">
              {m.lessons.map((l, li) => (
                <LessonRow key={l.id} lesson={l} locked={locked}
                  canUp={li > 0} canDown={li < m.lessons.length - 1}
                  onUp={() => run(() => reorderLessonsAPI(m.id, move(m.lessons, li, li - 1).map((x) => x.id)))}
                  onDown={() => run(() => reorderLessonsAPI(m.id, move(m.lessons, li, li + 1).map((x) => x.id)))}
                  onDelete={() => { if (window.confirm(`Delete lesson "${l.title}"?`)) void run(() => deleteLessonAPI(l.id)); }}
                  onSave={(input) => run(() => updateLessonAPI(l.id, input))} />
              ))}
              {m.lessons.length === 0 && <li className="px-3 py-2 text-muted">No lessons in this module yet.</li>}
            </ul>
            {!locked && <AddLesson onAdd={(input) => run(() => createLessonAPI(m.id, input))} />}
          </div>
        ))}
      </div>

      {!locked && (
        <div className="mt-3 flex gap-2">
          <input className="input" placeholder="New module title" aria-label="New module title" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
          <button className="btn btn-primary whitespace-nowrap" onClick={addModule}>Add module</button>
        </div>
      )}
    </section>
  );
}

function ModuleTitle({ title, locked, onSave }: { title: string; locked: boolean; onSave: (t: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  if (!editing || locked) {
    return (
      <>
        <b>{title}</b>
        {!locked && <button className="text-muted underline" onClick={() => { setValue(title); setEditing(true); }}>Rename</button>}
      </>
    );
  }
  return (
    <>
      <input className="input max-w-[260px]" aria-label="Module title" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn" onClick={async () => { await onSave(value); setEditing(false); }}>Save</button>
      <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
    </>
  );
}

type LessonFormValue = { title: string; youtubeUrl: string; isPreview: boolean };

function LessonForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: LessonFormValue; submitLabel: string; onSubmit: (v: LessonFormValue) => void | Promise<void>; onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<Record<string, string>>({});
  async function go() {
    const parsed = lessonInputSchema.safeParse(v);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setErr(errs);
    }
    setErr({});
    await onSubmit({ title: parsed.data.title, youtubeUrl: parsed.data.youtubeUrl, isPreview: parsed.data.isPreview });
    if (!onCancel) setV(initial);
  }
  return (
    <div className="grid gap-x-3 px-3 py-2 sm:grid-cols-2">
      <Field label="Lesson title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={err['title']} />
      <Field label="YouTube link" placeholder="https://www.youtube.com/watch?v=…" value={v.youtubeUrl} onChange={(e) => setV({ ...v, youtubeUrl: e.target.value })} error={err['youtubeUrl']} />
      <label className="mb-2 flex items-center gap-1.5 sm:col-span-2">
        <input type="checkbox" checked={v.isPreview} onChange={(e) => setV({ ...v, isPreview: e.target.checked })} />
        Free preview (visible without a subscription)
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" onClick={go}>{submitLabel}</button>
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

function AddLesson({ onAdd }: { onAdd: (v: LessonFormValue) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (!open) return <div className="border-t border-line-soft px-3 py-2"><button className="btn" onClick={() => setOpen(true)}>+ Add lesson</button></div>;
  return (
    <div className="border-t border-line-soft">
      <LessonForm initial={{ title: '', youtubeUrl: '', isPreview: false }} submitLabel="Add lesson" onSubmit={async (v) => { await onAdd(v); setOpen(false); }} onCancel={() => setOpen(false)} />
    </div>
  );
}

function LessonRow({ lesson, locked, canUp, canDown, onUp, onDown, onDelete, onSave }: {
  lesson: LessonDetail; locked: boolean; canUp: boolean; canDown: boolean;
  onUp: () => void; onDown: () => void; onDelete: () => void; onSave: (v: LessonFormValue) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li>
        <LessonForm initial={{ title: lesson.title, youtubeUrl: lesson.youtubeUrl ?? '', isPreview: lesson.isPreview }} submitLabel="Save lesson"
          onSubmit={async (v) => { await onSave(v); setEditing(false); }} onCancel={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-pill-in-bg text-[11px] font-bold text-navy">{lesson.order}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{lesson.title}</b>
        {lesson.youtubeUrl && <span className="block truncate text-[11px] text-muted">{lesson.youtubeUrl}</span>}
      </span>
      {lesson.isPreview && <span className="pill pill-info">Preview</span>}
      {!locked && (
        <div className="flex gap-1.5">
          <button className="btn" disabled={!canUp} aria-label="Move lesson up" onClick={onUp}>↑</button>
          <button className="btn" disabled={!canDown} aria-label="Move lesson down" onClick={onDown}>↓</button>
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn text-danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </li>
  );
}
