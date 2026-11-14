import { useEffect, useState } from 'react';
import type { PermissionMatrix } from '@lms/shared';
import { ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getPermissions, savePermissions } from '../../services/userService';

type Editable = 'INSTRUCTOR' | 'STUDENT';

function Tick({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick?: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      className={`grid h-[22px] w-[22px] place-items-center rounded-[6px] border text-[13px] font-bold ${
        on ? 'border-success bg-pill-ok-bg text-success' : 'border-line bg-card text-transparent'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-navy'}`}>
      ✓
    </button>
  );
}

export function RolesPage() {
  const { data: permissionsData, loaded: permissionsLoaded, error: permissionsError, callAPI: getPermissionsAPI } = useApi(getPermissions);
  const refetch = () => getPermissionsAPI().then(() => undefined, () => undefined);
  useEffect(() => { void refetch(); }, []);
  const [draft, setDraft] = useState<PermissionMatrix['roles'] | null>(null);
  const { loading: saveLoading, error: saveError, callAPI: savePermissionsAPI } = useApi(savePermissions);
  const saving = saveLoading;
  const [message, setMessage] = useState<{ text: string } | null>(null);

  useEffect(() => {
    if (permissionsData) setDraft({ INSTRUCTOR: { ...permissionsData.roles.INSTRUCTOR }, STUDENT: { ...permissionsData.roles.STUDENT } });
  }, [permissionsData]);

  if (!permissionsLoaded && !permissionsError) return <LoadingBlock />;
  if (permissionsError && !permissionsData) return <ErrorBlock message={permissionsError} onRetry={refetch} />;
  if (!permissionsData || !draft) return null;

  const changes = (['INSTRUCTOR', 'STUDENT'] as const).flatMap((role) =>
    permissionsData.permissions
      .filter((p) => draft[role][p.key] !== permissionsData.roles[role][p.key])
      .map((p) => ({ role, permissionKey: p.key, allowed: draft[role][p.key] ?? false })),
  );

  const flip = (role: Editable, key: string) =>
    setDraft((d) => (d ? { ...d, [role]: { ...d[role], [key]: !d[role][key] } } : d));

  async function save() {
    setMessage(null);
    try {
      await savePermissionsAPI(changes);
    } catch {
      return; // the message is in saveAction.error
    }
    await refetch();
    setMessage({ text: 'Permissions saved.' });
  }

  return (
    <>
      <p className="text-muted">Admin always has every permission. Toggle what instructors and students may do, then save.</p>
      {saveError && <ErrorBlock message={saveError} />}
      {message && <div className="card bg-pill-ok-bg text-pill-ok" role="status">{message.text}</div>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-left">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="px-3.5 py-2.5 font-semibold">Permission</th>
              <th className="px-3.5 py-2.5 text-center font-semibold">Admin</th>
              <th className="px-3.5 py-2.5 text-center font-semibold">Instructor</th>
              <th className="px-3.5 py-2.5 text-center font-semibold">Student</th>
            </tr>
          </thead>
          <tbody>
            {permissionsData.permissions.map((p) => (
              <tr key={p.key} className="border-b border-line-soft last:border-0">
                <td className="px-3.5 py-2.5">{p.label}</td>
                <td className="px-3.5 py-2.5"><div className="flex justify-center"><Tick on disabled label={`Admin: ${p.label} (always on)`} /></div></td>
                {(['INSTRUCTOR', 'STUDENT'] as const).map((role) => (
                  <td key={role} className="px-3.5 py-2.5">
                    <div className="flex justify-center">
                      <Tick on={draft[role][p.key] ?? false} label={`${role === 'INSTRUCTOR' ? 'Instructor' : 'Student'}: ${p.label}`} onClick={() => flip(role, p.key)} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button className="btn" disabled={changes.length === 0 || saving}
          onClick={() => setDraft({ INSTRUCTOR: { ...permissionsData.roles.INSTRUCTOR }, STUDENT: { ...permissionsData.roles.STUDENT } })}>Discard</button>
        <button className="btn btn-primary" disabled={changes.length === 0 || saving} onClick={save}>
          {saving ? 'Saving…' : `Save changes${changes.length ? ` (${changes.length})` : ''}`}
        </button>
      </div>
    </>
  );
}
