import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AuthUser } from '@lms/shared';
import { Icon } from './Icon';
import { NotificationBell } from './NotificationBell';

const ROLE_LABEL = { ADMIN: 'Admin', INSTRUCTOR: 'Instructor', STUDENT: 'Student' } as const;

// Where the top-bar search sends people. Instructors have no course search page, so they get no box.
const SEARCH_TARGET = { STUDENT: '/student/courses', ADMIN: '/admin/courses' } as const;

interface TopBarProps {
  title: string;
  user: AuthUser;
  onMenu: () => void;
  onLogout: () => void;
}

export function TopBar({ title, user, onMenu, onLogout }: TopBarProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchTarget = user.role === 'ADMIN' ? SEARCH_TARGET.ADMIN : user.role === 'STUDENT' ? SEARCH_TARGET.STUDENT : null;

  function search(e: FormEvent) {
    e.preventDefault();
    if (!searchTarget) return;
    const q = query.trim();
    navigate(q ? `${searchTarget}?search=${encodeURIComponent(q)}` : searchTarget);
  }

  return (
    <header className="relative z-20 flex flex-none items-center gap-2.5 border-b border-line bg-card px-4 py-2.5">
      <button className="grid h-[30px] w-[30px] place-items-center rounded-ctl border border-line text-muted md:hidden"
        onClick={onMenu} aria-label="Open menu"><Icon name="menu" size={15} /></button>
      <h1 className="mr-auto font-heading text-[16px] font-bold">{title}</h1>
      {searchTarget && (
        <form role="search" onSubmit={search} className="hidden w-60 items-center gap-1.5 rounded-ctl border border-line bg-page px-2.5 py-1.5 text-muted focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(30,42,94,0.15)] md:flex">
          <Icon name="search" size={14} />
          <input className="w-full bg-transparent text-ink outline-none placeholder:text-muted" placeholder="Search courses" aria-label="Search courses"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
      )}
      <NotificationBell />
      <div className="relative">
        <button className="flex items-center gap-[7px] text-left" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
          <i className="grid h-7 w-7 place-items-center rounded-full bg-gold font-bold not-italic text-navy">{user.name.charAt(0).toUpperCase()}</i>
          <span className="hidden sm:block">
            <b className="block leading-tight">{user.name}</b>
            <span className="block text-[11px] text-muted">{ROLE_LABEL[user.role]}</span>
          </span>
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-44 rounded-card border border-line bg-card p-1 shadow-drawer">
            <Link role="menuitem" to="/change-password" className="block rounded-nav px-2.5 py-2 hover:bg-page" onClick={() => setMenuOpen(false)}>Change password</Link>
            <button role="menuitem" className="block w-full rounded-nav px-2.5 py-2 text-left text-danger hover:bg-page" onClick={onLogout}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
