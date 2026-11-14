import { useState, type FormEvent } from 'react';
import { courseInputSchema, type CourseLevel } from '@lms/shared';
import { Field, FormError } from '../Field';
import useApi from '../../hooks/useApi';
import { createCourse } from '../../services/courseService';
import { LEVELS } from './courseUi';

/** Creates a DRAFT and hands back its id so the page can open the builder. */
export function NewCourseForm({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', category: '', level: 'BEGINNER' as CourseLevel });
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { loading: createLoading, error: createError, fieldErrors: createFieldErrors, callAPI: createCourseAPI } = useApi(createCourse);
  const fieldErrors = { ...createFieldErrors, ...formErrors };
  const busy = createLoading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = courseInputSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setFormErrors(errs);
    }
    setFormErrors({});
    try {
      onCreated(await createCourseAPI(parsed.data));
    } catch {
      /* create.error and create.fieldErrors are already set */
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card">
      <h5 className="mb-2 font-heading text-[14px] font-bold">New course</h5>
      <FormError message={error ?? createError} />
      <Field label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} error={fieldErrors['title']} />
      <Field label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} error={fieldErrors['category']} />
      <div className="mb-[9px]">
        <label htmlFor="nc-level" className="mb-[3px] block text-xs font-semibold">Level</label>
        <select id="nc-level" className="input" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as CourseLevel }))}>
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <div className="mb-3">
        <label htmlFor="nc-desc" className="mb-[3px] block text-xs font-semibold">Description</label>
        <textarea id="nc-desc" rows={3} className={`input ${fieldErrors['description'] ? 'border-danger' : ''}`}
          value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        {fieldErrors['description'] && <p className="mt-1 text-[11px] text-danger" role="alert">{fieldErrors['description']}</p>}
      </div>
      <p className="mb-2 text-muted">New courses start as a draft. You submit them for approval when ready.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? 'Creating…' : 'Create draft'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
