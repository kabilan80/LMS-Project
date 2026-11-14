import { useEffect, useState } from 'react';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getHomeCourseOptions, setHomeCourseShown } from '../../services/homeService';

const LEVEL = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' } as const;

/** Admin: choose which published courses appear on the public home page. */
export function HomeCoursesPage() {
  const { data: homeCourseOptions, loaded: homeCourseOptionsLoaded, error: homeCourseOptionsError, callAPI: getHomeCourseOptionsAPI } = useApi(getHomeCourseOptions);
  const refetch = () => getHomeCourseOptionsAPI().then(() => undefined, () => undefined);
  useEffect(() => { void refetch(); }, []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { error: setHomeCourseShownError, callAPI: setHomeCourseShownAPI } = useApi(setHomeCourseShown);
  const problem = setHomeCourseShownError;

  if (!homeCourseOptionsLoaded && !homeCourseOptionsError) return <LoadingBlock />;
  if (homeCourseOptionsError || !homeCourseOptions) return <ErrorBlock message={homeCourseOptionsError ?? 'Could not load courses'} onRetry={refetch} />;

  const shown = homeCourseOptions.items.filter((c) => c.showOnHome).length;

  async function toggle(id: number, show: boolean) {
    setBusyId(id);
    try {
      await setHomeCourseShownAPI(id, show);
      await refetch();
    } catch {
      /* setShownAction.error is shown above */
    }
    setBusyId(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">Visitors see these courses on the public home page. Only published courses can be shown.</p>
        <b>{shown} of {homeCourseOptions.max} shown</b>
      </div>
      {problem && <ErrorBlock message={problem} />}
      {homeCourseOptions.items.length === 0 ? <EmptyState title="No published courses yet" message="Publish a course first, then choose it here." /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left">
            <thead><tr className="border-b border-line text-muted">
              <th className="px-3.5 py-2.5 font-semibold">Course</th>
              <th className="px-3.5 py-2.5 font-semibold">Level</th>
              <th className="px-3.5 py-2.5 font-semibold">On home page</th>
              <th className="px-3.5 py-2.5" />
            </tr></thead>
            <tbody>
              {homeCourseOptions.items.map((c) => (
                <tr key={c.id} className="border-b border-line-soft last:border-0">
                  <td className="px-3.5 py-2.5"><b className="block">{c.title}</b><span className="text-muted">{c.category} · {c.teacherName}</span></td>
                  <td className="px-3.5 py-2.5 text-muted">{LEVEL[c.level]}</td>
                  <td className="px-3.5 py-2.5">{c.showOnHome ? <Pill tone="ok">Shown</Pill> : <Pill tone="info">Hidden</Pill>}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button className={`btn disabled:opacity-60 ${c.showOnHome ? '' : 'btn-primary'}`} disabled={busyId === c.id}
                      onClick={() => void toggle(c.id, !c.showOnHome)}>{c.showOnHome ? 'Hide' : 'Show on home page'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
