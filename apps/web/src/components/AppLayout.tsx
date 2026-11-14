import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '@lms/shared';
import { useAuthStore } from '../store/authStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

// Pages opened from a list (not menu items) get their own titles. Matched on whole path segments.
const EXTRA_TITLES: [string, string][] = [
  ['/student/checkout', 'Checkout'],
  ['/student/learn', 'Lesson'],
  ['/student/preview', 'Free preview'],
  ['/student/quiz-result', 'Quiz result'],
  ['/student/quiz', 'Quiz'],
];
const underPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * One layout for all three roles. The window itself never scrolls:
 * the sidebar and top bar stay fixed and only <main> scrolls.
 */
export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  if (!user) return null; // route guard guarantees a user; this keeps types honest

  const title =
    EXTRA_TITLES.find(([base]) => underPath(pathname, base))?.[1] ??
    NAV[user.role].flatMap((g) => g.items).find((i) => underPath(pathname, i.path))?.label ??
    'Dashboard';

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-ctl focus:bg-gold focus:px-3 focus:py-2 focus:font-semibold focus:text-gold-ink">
        Skip to main content
      </a>
      <Sidebar role={user.role} open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <TopBar title={title} user={user} onMenu={() => setDrawer(true)}
          onLogout={() => { navigate('/', { replace: true }); logout(); }} />
        <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 focus:outline-none"><Outlet /></main>
      </div>
    </div>
  );
}
