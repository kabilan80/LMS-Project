import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLE_HOME, changePasswordSchema } from '@lms/shared';
import { Field, FormError } from '../../components/Field';
import useApi from '../../hooks/useApi';
import { changePassword } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { AuthShell } from './AuthShell';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { loading: changeLoading, error: changeError, callAPI: changePasswordAPI, reset: resetChange } = useApi(changePassword);
  const busy = changeLoading;
  const error = changeError;
  const forced = user?.mustChangePassword ?? false;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    resetChange();
    const errs: Record<string, string> = {};
    const parsed = changePasswordSchema.safeParse({ currentPassword: form.currentPassword, newPassword: form.newPassword });
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (form.newPassword !== form.confirm) errs['confirm'] = 'Passwords do not match';
    if (Object.keys(errs).length > 0 || !parsed.success) return setFieldErrors(errs);
    setFieldErrors({});
    try {
      const res = await changePasswordAPI(parsed.data.currentPassword, parsed.data.newPassword);
      setSession(res);
      navigate(ROLE_HOME[res.user.role], { replace: true });
    } catch {
      /* the message is in change.error */
    }
  }

  return (
    <AuthShell>
      <h3 className="font-heading text-[22px] font-bold">Change password</h3>
      <div className="mb-3 text-muted">
        {forced ? 'Set your own password to continue. The temporary one is only for the first sign-in.' : 'Choose a new password.'}
      </div>
      <form onSubmit={onSubmit} noValidate>
        <FormError message={error} />
        <Field label={forced ? 'Temporary password' : 'Current password'} type="password" autoComplete="current-password"
          value={form.currentPassword} onChange={set('currentPassword')} error={fieldErrors['currentPassword']} />
        <Field label="New password" type="password" autoComplete="new-password"
          value={form.newPassword} onChange={set('newPassword')} error={fieldErrors['newPassword']} />
        <Field label="Confirm new password" type="password" autoComplete="new-password"
          value={form.confirm} onChange={set('confirm')} error={fieldErrors['confirm']} />
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-1 flex w-full justify-center disabled:opacity-60">
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
      {!forced && user && (
        <div className="mt-3 text-center"><Link to={ROLE_HOME[user.role]} className="text-muted">Cancel</Link></div>
      )}
    </AuthShell>
  );
}
