import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatMoney } from '@lms/shared';
import { CourseCard } from '../../components/course/CourseCard';
import { LEVELS } from '../../components/course/courseUi';
import { Pill } from '../../components/Pill';
import { ProgressBar } from '../../components/ProgressBar';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useDebounced';
import { getCategories, getPlans } from '../../services/commerceService';
import { getCourses } from '../../services/courseService';
import { getMyCourses } from '../../services/learningService';

const PAGE_SIZE = 12;

type Scope = 'all' | 'mine';

/**
 * The one student course page. The Scope filter switches between every published course ("All courses") and
 * the courses the student can open ("My courses", with progress and Continue). Search/level/category/sort apply to both.
 */
export function CatalogPage() {
  const [urlParams, setUrlParams] = useSearchParams();
  const scope: Scope = urlParams.get('scope') === 'mine' ? 'mine' : 'all';
  const urlSearch = urlParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search);
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [sort, setSort] = useState<'newest' | 'title'>('newest');
  const [page, setPage] = useState(1);
  // The top-bar search sends people here with ?search=...; follow it when it changes.
  useEffect(() => {
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);

  const { data: categoriesData, callAPI: getCategoriesAPI } = useApi(getCategories);
  const { data: plansData, callAPI: getPlansAPI } = useApi(getPlans);
  const { data: myCoursesData, error: myCoursesError, callAPI: getMyCoursesAPI } = useApi(getMyCourses);
  const { data: courses, loaded: coursesLoaded, error: coursesError, callAPI: getCoursesAPI } = useApi(getCourses);
  const loadMine = () => getMyCoursesAPI().catch(() => undefined);
  const loadList = () =>
    getCoursesAPI({
        page,
        pageSize: PAGE_SIZE,
        search: debounced || undefined,
        category: category || undefined,
        level: (level || undefined) as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | undefined,
        sort,
      })
      .catch(() => undefined);

  useEffect(() => { getCategoriesAPI().catch(() => undefined); }, []);
  useEffect(() => { getPlansAPI().catch(() => undefined); }, []);
  // Only the query for the selected scope runs.
  useEffect(() => { if (scope === 'mine') void loadMine(); }, [scope]);
  useEffect(() => { if (scope === 'all') void loadList(); }, [scope, page, debounced, category, level, sort]);

  const single = plansData?.find((p) => p.type === 'SINGLE');
  const priceLabel = single ? formatMoney(single.priceMinor, single.currency) : undefined;
  const reset = (fn: () => void) => { fn(); setPage(1); };
  const setScope = (next: Scope) => {
    const p = new URLSearchParams(urlParams);
    if (next === 'mine') p.set('scope', 'mine'); else p.delete('scope');
    setUrlParams(p, { replace: true });
    setPage(1);
  };

  // "My courses" is a short list, so search / level / category / sort / paging are done here.
  const mineAll = myCoursesData ?? [];
  const mineFiltered = mineAll
    .filter((c) => (!debounced || c.title.toLowerCase().includes(debounced.toLowerCase())) && (!category || c.category === category) && (!level || c.level === level))
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.id - a.id));
  const minePage = mineFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isLoading = scope === 'mine' ? !myCoursesData && !myCoursesError : !coursesLoaded && !coursesError;
  const err = scope === 'mine' ? myCoursesError : coursesError;
  const retry = scope === 'mine' ? () => void loadMine() : () => void loadList();
  const total = scope === 'mine' ? mineFiltered.length : (courses?.total ?? 0);
  const empty = scope === 'mine' ? mineFiltered.length === 0 : !courses || courses.items.length === 0;

  return (
    <>
      <div className="flex gap-1.5" role="group" aria-label="Course scope">
        {([['all', 'All courses'], ['mine', 'My courses']] as const).map(([key, label]) => (
          <button key={key} aria-pressed={scope === key} onClick={() => setScope(key)}
            className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold ${scope === key ? 'border-navy bg-navy text-white' : 'border-line bg-card'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-[260px]" placeholder="Search courses" aria-label="Search courses" value={search} onChange={(e) => reset(() => setSearch(e.target.value))} />
        <select className="input w-auto" aria-label="Level" value={level} onChange={(e) => reset(() => setLevel(e.target.value))}>
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select className="input ml-auto w-auto" aria-label="Sort" value={sort} onChange={(e) => reset(() => setSort(e.target.value as typeof sort))}>
          <option value="newest">Sort: Newest</option>
          <option value="title">Sort: Title A–Z</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
        {['', ...(categoriesData ?? [])].map((c) => (
          <button
            key={c || 'all'}
            aria-pressed={category === c}
            onClick={() => reset(() => setCategory(c))}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${category === c ? 'border-navy bg-navy text-white' : 'border-line bg-card'}`}
          >
            {c || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingBlock /> : err ? <ErrorBlock message={err} onRetry={retry} /> :
        empty ? (
          scope === 'mine' && mineAll.length === 0 ? (
            <div className="card py-10 text-center">
              <h5 className="font-heading text-[15px] font-bold">No courses yet</h5>
              <p className="mb-3 mt-1 text-muted">Buy a course, choose a plan, or ask your instructor for access.</p>
              <button className="btn btn-primary" onClick={() => setScope('all')}>Browse all courses</button>
            </div>
          ) : <EmptyState title="No courses found" message="Try a different search or filter." />
        ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {scope === 'mine'
              ? minePage.map((c) => (
                <article key={c.id} className="card flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-heading text-[14px] font-bold leading-snug">{c.title}</h3>
                    {c.certificateId ? <Pill tone="ok">Certified</Pill> : c.allLessonsDone ? <Pill tone="wait">Quiz ready</Pill> : null}
                  </div>
                  <span className="text-[11px] text-muted">{c.category}</span>
                  <ProgressBar value={c.completedLessons} max={c.totalLessons} label={`${c.title} progress`} />
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-muted">{c.completedLessons} of {c.totalLessons} lessons</span>
                    <Link to={c.nextLessonId ? `/student/learn/${c.id}/${c.nextLessonId}` : `/student/learn/${c.id}`} className="btn btn-primary">
                      {c.completedLessons === 0 ? 'Start' : c.nextLessonId ? 'Continue' : 'Review'}
                    </Link>
                  </div>
                </article>
              ))
              : courses?.items.map((c) => <CourseCard key={c.id} course={c} priceLabel={priceLabel} to={`/student/courses/${c.id}`} />)}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </>
  );
}
