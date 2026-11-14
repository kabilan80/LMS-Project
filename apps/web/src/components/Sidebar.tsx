import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV, type Role } from '@lms/shared';
import { Brand, Icon } from './Icon';

interface SidebarProps {
  role: Role;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ role, open, onClose }: SidebarProps) {
  // Escape closes the phone drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-sidebar flex-none flex-col gap-0.5 overflow-y-auto bg-navy px-2.5 py-3.5 text-side-text transition-transform motion-reduce:transition-none md:static md:translate-x-0 ${
          open ? 'translate-x-0 shadow-drawer' : '-translate-x-full'
        }`}
      >
        <Brand className="px-1.5 pb-3 pt-0.5" />
        <nav aria-label="Main menu" className="flex flex-col gap-0.5">
          {NAV[role].map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5">
              <div className="px-2 pb-[3px] pt-2.5 text-[11px] text-side-group">{g.group}</div>
              {g.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : 'hover:bg-navy-2/60'}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto p-2 text-[11px] text-side-group">v1.0</div>
      </aside>
    </>
  );
}
