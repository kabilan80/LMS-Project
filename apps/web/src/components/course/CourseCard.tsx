import { Link } from 'react-router-dom';
import type { AccessSource, CourseListItem } from '@lms/shared';
import { Pill } from '../Pill';
import { LEVELS } from './courseUi';

const ACCESS_LABEL: Record<AccessSource, string> = {
  SINGLE: 'Purchased',
  BUNDLE: 'In your bundle',
  ANNUAL: 'Annual package',
  GRANT: 'Access granted',
};

export function AccessPill({ access }: { access: AccessSource | null | undefined }) {
  return access ? <Pill tone="ok">{ACCESS_LABEL[access]}</Pill> : <Pill tone="wait">Locked</Pill>;
}

export function CourseCard({ course, priceLabel, to }: { course: CourseListItem; priceLabel?: string | undefined; to: string }) {
  const unlocked = !!course.access;
  const level = LEVELS.find((l) => l.value === course.level)?.label ?? course.level;
  return (
    <article className="card flex flex-col gap-2">
      <div
        className="grid h-[110px] place-items-center rounded-ctl bg-navy text-3xl text-white"
        style={course.thumbnailUrl ? { backgroundImage: `url(${course.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        aria-hidden="true"
      >
        {!course.thumbnailUrl && '▶'}
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Pill tone="info">{course.category}</Pill>
          <span className="text-[11px] text-muted">{level}</span>
        </div>
        <h3 className="font-heading text-[14px] font-bold leading-snug">{course.title}</h3>
        <p className="text-[11px] text-muted">{course.creator.name} · {course.lessonCount} lessons</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        {unlocked ? <AccessPill access={course.access} /> : <span className="font-semibold">{priceLabel ?? ''}</span>}
        <Link to={to} className={unlocked ? 'btn btn-primary' : 'btn'}>
          {unlocked ? 'Open' : 'View details'}
        </Link>
      </div>
    </article>
  );
}
