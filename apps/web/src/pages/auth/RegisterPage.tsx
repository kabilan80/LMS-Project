import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema } from '@lms/shared';
import { Field, FormError } from '../../components/Field';
import useApi from '../../hooks/useApi';
import { registerUser } from '../../services/authService';
import { AuthShell } from './AuthShell';

/** Students only. There is no role choice: instructors are created by the admin. */
export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const { loading: registerLoading, error: registerError, fieldErrors: registerFieldErrors, callAPI: registerUserAPI, reset: resetRegister } = useApi(registerUser);
  const busy = registerLoading;
  const error = registerError;
  const fieldErrors = { ...localErrors, ...registerFieldErrors };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    resetRegister();
    const parsed = registerSchema.safeParse({ ...form, acceptTerms });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});
    try {
      await registerUserAPI({ ...parsed.data });
      // No auto sign-in: the new student signs in themselves from the login page.
      navigate('/login', { replace: true, state: { registeredEmail: parsed.data.email } });
    } catch {
      /* the message and field errors are in register.error / register.fieldErrors */
    }
  }

  return (
    <AuthShell>
      <h3 className="font-heading text-[22px] font-bold">Create your account</h3>
      <div className="mb-3 text-muted">Start learning today</div>
      <form onSubmit={onSubmit} noValidate>
        <FormError message={error} />
        <Field label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={fieldErrors['name']} />
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fieldErrors['email']} />
        <Field label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={fieldErrors['password']} />
        <Field label="Confirm password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} error={fieldErrors['confirmPassword']} />
        <label className="mb-3 flex items-center gap-1.5">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} /> I agree to the terms
        </label>
        {fieldErrors['acceptTerms'] && <p className="-mt-2 mb-3 text-[11px] text-danger" role="alert">{fieldErrors['acceptTerms']}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg flex w-full justify-center disabled:opacity-60">
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <div className="mt-3 text-center text-muted">
        Already have an account? <Link to="/login" className="font-bold text-ink">Sign in</Link>
      </div>
    </AuthShell>
  );
}
