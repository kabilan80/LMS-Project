import { useEffect, useRef, useState } from 'react';
import useApi from '../hooks/useApi';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../services/dashboardService';
import { timeAgo } from '../utils/format';
import { Icon } from './Icon';

/** Bell with an unread badge. Refreshes by itself every 30 seconds (no WebSockets in v1). */
export function NotificationBell() {
  const { data: notifications, callAPI: getNotificationsAPI } = useApi(getNotifications);
  const [open, setOpen] = useState(false);
  const { callAPI: markNotificationReadAPI } = useApi(markNotificationRead);
  const { callAPI: markAllNotificationsReadAPI } = useApi(markAllNotificationsRead);
  const box = useRef<HTMLDivElement>(null);
  const unread = notifications?.unread ?? 0;

  // Load once, then refresh every 30 seconds while the tab is visible. A failed refresh keeps the last list.
  useEffect(() => {
    getNotificationsAPI().catch(() => undefined);
    const t = window.setInterval(() => {
      if (!document.hidden) getNotificationsAPI().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(t);
  }, [getNotificationsAPI]);

  useEffect(() => {
    if (!open) return;
    getNotificationsAPI().catch(() => undefined); // fresh list every time it opens
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, getNotificationsAPI]);

  async function read(id: number) {
    try { await markNotificationReadAPI(id); } catch { /* the refresh below shows the true state */ }
    getNotificationsAPI().catch(() => undefined);
  }
  async function readAll() {
    try { await markAllNotificationsReadAPI(); } catch { /* the refresh below shows the true state */ }
    getNotificationsAPI().catch(() => undefined);
  }

  return (
    <div className="relative" ref={box}>
      <button
        className="relative grid h-[30px] w-[30px] place-items-center rounded-ctl border border-line text-muted"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={15} />
        {unread > 0 && (
          <em aria-hidden="true" className="absolute -right-[5px] -top-[5px] grid h-4 min-w-4 place-items-center rounded-lg bg-danger px-1 text-[10px] not-italic text-white">
            {unread > 99 ? '99+' : unread}
          </em>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-24px))] rounded-card border border-line bg-card shadow-drawer">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <b>Notifications</b>
            <button className="text-navy underline disabled:text-muted disabled:no-underline" disabled={unread === 0} onClick={readAll}>Mark all read</button>
          </div>
          {!notifications || notifications.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted">You are all caught up.</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {notifications.items.map((n) => (
                <li key={n.id} className="border-b border-line-soft last:border-0">
                  <button className={`block w-full px-3 py-2 text-left hover:bg-page ${n.readAt ? '' : 'bg-pill-in-bg/50'}`} onClick={() => (n.readAt ? undefined : void read(n.id))}>
                    <span className="flex items-start gap-2">
                      {!n.readAt && <span aria-label="Unread" className="mt-1.5 h-2 w-2 flex-none rounded-full bg-gold" />}
                      <span className="min-w-0">
                        <b className="block">{n.title}</b>
                        <span className="block text-muted">{n.body}</span>
                        <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">{unread > 0 ? `${unread} unread notifications` : ''}</span>
    </div>
  );
}
