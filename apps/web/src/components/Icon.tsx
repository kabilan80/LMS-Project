import type { ReactNode } from 'react';

export type IconName = 'home' | 'book' | 'play' | 'check' | 'award' | 'users' | 'edit' | 'doubt' | 'search' | 'bell' | 'menu';

// Paths copied from the design files' icon set (24x24, stroke 1.8).
const PATHS: Record<IconName, ReactNode> = {
  home: (<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5V22h16" /></>),
  play: (<><circle cx="12" cy="12" r="10" /><path d="M10 8l6 4-6 4z" /></>),
  check: (<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>),
  award: (<><circle cx="12" cy="8" r="6" /><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5" /></>),
  users: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>),
  edit: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  doubt: (<><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.1-4.8A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" /></>),
  search: (<><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></>),
  bell: (<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  menu: (<><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Brand({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-[9px] font-heading text-[16px] font-bold text-white ${className}`}>
      <i className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gold text-navy"><Icon name="book" size={15} /></i>
      LearnHub
    </div>
  );
}
