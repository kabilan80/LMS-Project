import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DEV_LOGINS, ROLE_HOME, loginSchema } from '@lms/shared';
import { Field, FormError } from '../../components/Field';
import useApi from '../../hooks/useApi';
import { loginUser } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { log } from '../../utils/log';
import { AuthShell } from './AuthShell';

/** DEVELOPMENT ONLY: ids for the dummy sessions. */
const DEV_IDS = { ADMIN: 1, INSTRUCTOR: 2, STUDENT: 3 } as const;

export function LoginPage() {
  const navigate = useNavigate();
  const registeredEmail = (useLocation().state as { registeredEmail?: string } | null)?.registeredEmail;
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState(registeredEmail ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { loading: loginLoading, error: loginError, callAPI: loginUserAPI, reset: resetLogin } = useApi(loginUser);
  const busy = loginLoading;
  const error = loginError;

  async function signIn(emailValue: string, passwordValue: string, devRole?: keyof typeof DEV_LOGINS) {
    resetLogin();
    const parsed = loginSchema.safeParse({ email: emailValue, password: passwordValue });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    log('LoginPage', 'sign in', { email: parsed.data.email });
    try {
      const res = await loginUserAPI(parsed.data.email, parsed.data.password);
      log('LoginPage', `signed in as ${res.user.role}, going to ${res.user.mustChangePassword ? '/change-password' : ROLE_HOME[res.user.role]}`);
      setSession(res, remember);
      navigate(res.user.mustChangePassword ? '/change-password' : ROLE_HOME[res.user.role], { replace: true });
    } catch (e) {
      // DEVELOPMENT ONLY: quick login still works when the API is not running (no response at all).
      // The dummy session only lets you see this role's screens; data calls need the real API.
      if (import.meta.env.DEV && devRole && isAxiosError(e) && !e.response) {
        const d = DEV_LOGINS[devRole];
        log('LoginPage', `API not reachable, using dummy ${devRole} session`);
        setSession({ token: `dev-offline-${devRole}`, user: { id: DEV_IDS[devRole], name: d.name, email: d.email, role: devRole, mustChangePassword: false } }, remember);
        navigate(ROLE_HOME[devRole], { replace: true });
      }
      /* otherwise the message is in login.error */
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  /** DEVELOPMENT ONLY: fills the form for that role and signs in. */
  function devLogin(role: keyof typeof DEV_LOGINS) {
    const d = DEV_LOGINS[role];
    log('LoginPage', `dev quick login: ${role}`);
    setEmail(d.email);
    setPassword(d.password);
    void signIn(d.email, d.password, role);
  }

  return (
    <AuthShell>
      <h3 className="font-heading text-[22px] font-bold">Sign in</h3>
      <div className="mb-3 text-muted">Welcome back</div>
      <form onSubmit={onSubmit} noValidate>
        {registeredEmail && !error && <p className="mb-3 rounded-ctl bg-pill-ok-bg px-3 py-2 text-pill-ok" role="status">Account created. Please sign in.</p>}
        <FormError message={error} />
        <Field label="Email" type="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors['email'] && 'Enter a valid email'} />
        <Field label="Password" type="password" autoComplete="current-password" placeholder="••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors['password']} />
        <div className="mb-3 flex items-center justify-between">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
          </label>
          <span className="text-muted" title="Ask your administrator to reset it">Forgot password?</span>
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg flex w-full justify-center disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {import.meta.env.DEV && (
        <div className="mt-3 rounded-ctl border border-dashed border-line p-2.5" aria-label="Development quick login">
          <div className="mb-1.5 text-center text-[11px] font-semibold text-muted">Development only: quick login</div>
          <div className="flex gap-2">
            {(['ADMIN', 'INSTRUCTOR', 'STUDENT'] as const).map((r) => (
              <button key={r} type="button" disabled={busy} className="btn flex-1 justify-center disabled:opacity-60" onClick={() => devLogin(r)}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 text-center text-muted">
        New here? <Link to="/register" className="font-bold text-ink">Create an account</Link>
      </div>
    </AuthShell>
  );
}
