import { useState, type FormEvent } from 'react';
import { courseInputSchema, type CourseDetail, type CourseLevel } from '@lms/shared';
import { Field, FormError } from '../Field';
import useApi from '../../hooks/useApi';
import { updateCourse } from '../../services/courseService';
import { LEVELS } from './courseUi';

export function CourseInfoForm({ course, onSaved }: { course: CourseDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    category: course.category,
    level: course.level as CourseLevel,
    passMark: String(course.passMark),
    maxAttempts: String(course.maxAttempts),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { loading: updateLoading, error: updateError, fieldErrors: updateFieldErrors, callAPI: updateCourseAPI } = useApi(updateCourse);
  const fieldErrors = { ...updateFieldErrors, ...formErrors };
  const busy = updateLoading;
  const locked = !course.canEdit;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = courseInputSchema.safeParse({
      ...form,
      passMark: Number(form.passMark),
      maxAttempts: Number(form.maxAttempts),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setFormErrors(errs);
    }
    setFormErrors({});
    try {
      await updateCourseAPI(course.id, parsed.data);
      setSaved(true);
      onSaved();
    } catch {
      /* update.error and update.fieldErrors are already set */
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card">
      <h5 className="mb-2 font-heading text-[14px] font-bold">Course info</h5>
      <FormError message={error ?? updateError} />
      <fieldset disabled={locked} className="min-w-0">
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Title" value={form.title} onChange={set('title')} error={fieldErrors['title']} />
          <Field label="Category" value={form.category} onChange={set('category')} error={fieldErrors['category']} />
          <div className="mb-[9px]">
            <label htmlFor="ci-level" className="mb-[3px] block text-xs font-semibold">Level</label>
            <select id="ci-level" className="input" value={form.level} onChange={set('level')}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pass mark (%)" type="number" min={1} max={100} value={form.passMark} onChange={set('passMark')} error={fieldErrors['passMark']} />
            <Field label="Max attempts" type="number" min={1} max={20} value={form.maxAttempts} onChange={set('maxAttempts')} error={fieldErrors['maxAttempts']} />
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="ci-desc" className="mb-[3px] block text-xs font-semibold">Description</label>
          <textarea id="ci-desc" rows={4} className={`input ${fieldErrors['description'] ? 'border-danger' : ''}`} value={form.description} onChange={set('description')} />
          {fieldErrors['description'] && <p className="mt-1 text-[11px] text-danger" role="alert">{fieldErrors['description']}</p>}
        </div>
      </fieldset>
      {!locked && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? 'Saving…' : 'Save info'}</button>
          {saved && <span className="text-success" role="status">Saved</span>}
        </div>
      )}
    </form>
  );
}
