import { useEffect, useState, type FormEvent } from 'react';
import { createUserSchema, type UserRow } from '@lms/shared';
import { Field, FormError } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Pill } from '../../components/Pill';
import { SecretNotice } from '../../components/SecretNotice';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useDebounced';
import { log } from '../../utils/log';
import { createUser, getUsers, resetUserPassword, updateUser } from '../../services/userService';

const EMPTY = { name: '', email: '', expertise: '', phone: '' };
type NewRole = 'INSTRUCTOR' | 'ADMIN' | 'STUDENT';
const NEW_ROLES: NewRole[] = ['INSTRUCTOR', 'ADMIN', 'STUDENT'];
/** Turns what was typed ("student", " Admin ") into a role, or null when it is not one of the three. */
const parseRole = (text: string): NewRole | null => NEW_ROLES.find((r) => r === text.trim().toUpperCase()) ?? null;
const ROLE_LABEL = { ADMIN: 'Admin', INSTRUCTOR: 'Instructor', STUDENT: 'Student' } as const;

export function UsersPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [role, setRole] = useState<'' | 'ADMIN' | 'INSTRUCTOR' | 'STUDENT'>('');
  const [status, setStatus] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [secret, setSecret] = useState<{ title: string; password: string } | null>(null);
  const { error: updateError, callAPI: updateUserAPI, reset: resetUpdate } = useApi(updateUser);
  const { error: resetPasswordError, callAPI: resetUserPasswordAPI, reset: clearResetPassword } = useApi(resetUserPassword);
  const actionError = updateError ?? resetPasswordError;

  const { data: usersData, loaded: usersLoaded, error: usersError, callAPI: getUsersAPI } = useApi(getUsers);
  const refetch = () =>
    getUsersAPI({ page, pageSize: 10, search: debounced || undefined, role: role || undefined, active: status || undefined })
      .then(() => undefined, () => undefined);
  useEffect(() => { void refetch(); }, [page, debounced, role, status]);

  async function toggleActive(u: UserRow) {
    clearResetPassword();
    try {
      await updateUserAPI(u.id, { active: !u.active });
      await refetch();
    } catch {
      /* updateAction.error is shown above */
    }
  }

  async function reset(u: UserRow) {
    if (!window.confirm(`Reset the password for ${u.name}? Their current password stops working.`)) return;
    resetUpdate();
    try {
      const password = await resetUserPasswordAPI(u.id);
      setSecret({ title: `New temporary password for ${u.name}`, password });
    } catch {
      /* resetAction.error is shown above */
    }
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[1fr_300px]">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="input max-w-[240px]" placeholder="Search name or email" aria-label="Search users"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="input w-auto" aria-label="Role" value={role}
            onChange={(e) => { setRole(e.target.value as typeof role); setPage(1); }}>
            <option value="">All roles</option>
            <option value="ADMIN">Admins</option>
            <option value="INSTRUCTOR">Instructors</option>
            <option value="STUDENT">Students</option>
          </select>
          <select className="input w-auto" aria-label="Status" value={status}
            onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </select>
        </div>

        {secret && <div className="mb-3"><SecretNotice {...secret} onClose={() => setSecret(null)} /></div>}
        {actionError && <div className="mb-3"><ErrorBlock message={actionError} /></div>}

        {!usersLoaded && !usersError ? <LoadingBlock /> : usersError ? <ErrorBlock message={usersError} onRetry={refetch} /> :
          !usersData || usersData.items.length === 0 ? <EmptyState title="No users found" message="Try different filters, or create an admin, instructor or student." /> : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-3.5 py-2.5 font-semibold">Name</th>
                  <th className="px-3.5 py-2.5 font-semibold">Role</th>
                  <th className="px-3.5 py-2.5 font-semibold">Details</th>
                  <th className="px-3.5 py-2.5 font-semibold">Status</th>
                  <th className="px-3.5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {usersData.items.map((u) => (
                  <tr key={u.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3.5 py-2.5"><b className="block">{u.name}</b><span className="text-muted">{u.email}</span></td>
                    <td className="px-3.5 py-2.5">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3.5 py-2.5 text-muted">
                      {u.role === 'ADMIN' ? 'Full access' : u.role === 'INSTRUCTOR' ? `${u.expertise ?? '—'} · ${u.studentCount} students` : (u.instructorName ?? 'Unassigned')}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {!u.active ? <Pill tone="bad">Disabled</Pill> : u.mustChangePassword ? <Pill tone="wait">Awaiting first login</Pill> : <Pill tone="ok">Active</Pill>}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                      {u.locked ? <span className="text-muted">Protected</span> : (
                        <>
                          <button className="btn mr-1.5" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                          <button className="btn" onClick={() => reset(u)}>Reset password</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {usersData && usersData.total > 0 && <Pagination page={usersData.page} pageSize={usersData.pageSize} total={usersData.total} onChange={setPage} />}
      </section>

      <CreateUserPanel onCreated={(title, password) => { setSecret({ title, password }); void refetch(); }} />
    </div>
  );
}

function CreateUserPanel({ onCreated }: { onCreated: (title: string, password: string) => void }) {
  // The role can be picked from the dropdown OR typed by hand. Both change the same value.
  const [roleText, setRoleText] = useState<string>(ROLE_LABEL.INSTRUCTOR);
  const newRole = parseRole(roleText);
  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { loading: createLoading, error: createError, fieldErrors: createFieldErrors, callAPI: createUserAPI, reset: resetCreate } = useApi(createUser);
  const busy = createLoading;
  const error = createError;
  const fieldErrors = { ...createFieldErrors, ...formErrors };
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const label = newRole ? ROLE_LABEL[newRole] : 'User';

  async function submit(e: FormEvent) {
    e.preventDefault();
    resetCreate();
    log('UsersPage', 'create user clicked', { role: roleText, name: form.name, email: form.email });
    const parsed = createUserSchema.safeParse({
      role: roleText,
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      ...(newRole === 'INSTRUCTOR' ? { expertise: form.expertise } : {}),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setFormErrors(errs);
    }
    setFormErrors({});
    try {
      const res = await createUserAPI(parsed.data);
      onCreated(`${label} created: ${res.user.name}. Temporary password`, res.temporaryPassword);
      setForm(EMPTY);
    } catch {
      /* create.error / create.fieldErrors are shown in the form */
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card">
      <h5 className="mb-2 font-heading text-[14px] font-bold">Create {label.toLowerCase()}</h5>
      <div className="mb-[9px]">
        <label htmlFor="new-user-role" className="mb-[3px] block text-xs font-semibold">Role</label>
        <select id="new-user-role" className="input" value={newRole ?? ''}
          onChange={(e) => { setRoleText(e.target.value ? ROLE_LABEL[e.target.value as NewRole] : ''); setFormErrors({}); resetCreate(); }}>
          {!newRole && <option value="">Choose a role…</option>}
          {NEW_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <Field label="Or type the role (admin, instructor or student)" id="new-user-role-text" value={roleText}
        onChange={(e) => { setRoleText(e.target.value); setFormErrors({}); resetCreate(); }} error={fieldErrors['role']} />
      <FormError message={error} />
      <Field label="Full name" value={form.name} onChange={set('name')} error={fieldErrors['name']} />
      <Field label="Email" type="email" value={form.email} onChange={set('email')} error={fieldErrors['email']} />
      {newRole === 'INSTRUCTOR' && <Field label="Expertise" value={form.expertise} onChange={set('expertise')} error={fieldErrors['expertise']} />}
      <Field label="Phone (optional)" value={form.phone} onChange={set('phone')} error={fieldErrors['phone']} />
      {newRole === 'ADMIN' && <p className="mb-2 rounded-nav bg-pill-wa-bg px-2.5 py-2 text-pill-wa">An admin can manage everything: users, courses, plans and roles.</p>}
      {newRole === 'STUDENT' && <p className="mb-2 rounded-nav bg-pill-in-bg px-2.5 py-2 text-navy">A student can sign in and take courses. Assign an instructor later on the Assign instructors page.</p>}
      <p className="mb-2 text-muted">A strong temporary password is generated and shown once.</p>
      <button type="submit" disabled={busy} className="btn btn-primary btn-lg flex w-full justify-center disabled:opacity-60">
        {busy ? 'Creating…' : `Create ${label.toLowerCase()}`}
      </button>
    </form>
  );
}
