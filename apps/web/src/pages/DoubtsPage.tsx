import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { DoubtContact, DoubtMessageRow } from '@lms/shared';
import { ErrorBlock, LoadingBlock } from '../components/Status';
import useApi from '../hooks/useApi';
import { getDoubtContacts, getDoubtThread, sendDoubtMessage } from '../services/doubtService';
import { useAuthStore } from '../store/authStore';

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function dayLabel(d: Date): string {
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  return sameDay(d, y) ? 'Yesterday' : dayFmt.format(d);
}
/** Contact list shows the time for today and the date for older messages, like WhatsApp. */
const listStamp = (iso: string) => (sameDay(new Date(iso), new Date()) ? timeFmt.format(new Date(iso)) : dayFmt.format(new Date(iso)));

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <i style={{ width: size, height: size }}
      className="grid flex-none place-items-center rounded-full bg-gold font-heading text-[14px] font-bold not-italic text-navy" aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </i>
  );
}

/**
 * Doubts page. A student has only one instructor, so they see just the conversation with that instructor
 * (no contact list). An instructor has many students, so they get a WhatsApp Desktop style layout: students
 * on the left, the conversation on the right, in the LearnHub colours.
 */
export function DoubtsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isStudent = role === 'STUDENT';
  const { data: doubtContacts, loading: doubtContactsLoading, error: doubtContactsError, callAPI: getDoubtContactsAPI } = useApi(getDoubtContacts);
  const refreshContacts = () => getDoubtContactsAPI().then(() => undefined).catch(() => undefined);
  // Load once, then refresh every 10 seconds while the tab is visible (a failed refresh keeps the list).
  useEffect(() => {
    getDoubtContactsAPI().catch(() => undefined);
    const t = window.setInterval(() => {
      if (!document.hidden) getDoubtContactsAPI().catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(t);
  }, [getDoubtContactsAPI]);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const all = doubtContacts ?? [];
  // A student has one contact, so open it straight away. Instructors pick from the list.
  useEffect(() => {
    if (isStudent && selected === null && all[0]) setSelected(all[0].id);
  }, [isStudent, selected, all]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => c.name.toLowerCase().includes(q) || (c.subtitle ?? '').toLowerCase().includes(q)) : all;
  }, [all, search]);
  const current = all.find((c) => c.id === selected) ?? null;

  if (doubtContactsLoading && !doubtContacts) return <LoadingBlock />;
  if (doubtContactsError && !doubtContacts) return <ErrorBlock message={doubtContactsError} onRetry={refreshContacts} />;

  return (
    <div className="flex min-h-[460px] flex-1 overflow-hidden rounded-card border border-line bg-card" aria-label="Doubts">
      {/* Left: contacts. On a phone only one side shows at a time. */}
      {!isStudent && (
        <aside className={`${current ? 'hidden md:flex' : 'flex'} w-full flex-none flex-col border-r border-line bg-card md:w-[320px]`} aria-label="Students">
          <div className="flex items-center justify-between bg-navy px-3.5 py-3 text-white">
            <b className="font-heading text-[15px]">Doubts</b>
            <span className="text-[11px] text-side-text">{`${all.length} student${all.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="border-b border-line-soft p-2">
            <input className="input rounded-full bg-page" placeholder="Search students" aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((c) => <ContactItem key={c.id} c={c} active={c.id === selected} onPick={() => setSelected(c.id)} />)}
            {shown.length === 0 && (
              <li className="px-4 py-8 text-center text-muted">{all.length === 0 ? 'No students are assigned to you yet.' : 'No students match your search.'}</li>
            )}
          </ul>
        </aside>
      )}

      {/* Right: conversation */}
      <section className={`${current || isStudent ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`} aria-label="Conversation">
        {current ? (
          <Conversation key={current.id} contact={current} isStudent={isStudent} {...(isStudent ? {} : { onBack: () => setSelected(null) })} onChanged={refreshContacts} />
        ) : (
          <div className="doubt-wallpaper grid flex-1 place-items-center p-6 text-center">
            <div>
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-navy text-[24px] text-white" aria-hidden="true">?</div>
              <h3 className="font-heading text-[16px] font-bold">{isStudent ? 'No instructor assigned yet' : 'Select a student'}</h3>
              <p className="mt-1 max-w-xs text-muted">
                {isStudent ? 'The admin will assign your instructor soon. After that you can ask your doubts here.' : 'Choose a student on the left to read and answer their doubts.'}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ContactItem({ c, active, onPick }: { c: DoubtContact; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-2.5 border-b border-line-soft px-3 py-2.5 text-left ${active ? 'bg-pill-in-bg' : 'hover:bg-page'}`}>
        <Avatar name={c.name} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <b className="truncate">{c.name}</b>
            {c.lastAt && <span className={`flex-none text-[11px] ${c.unread > 0 ? 'font-bold text-navy' : 'text-muted'}`}>{listStamp(c.lastAt)}</span>}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-muted">{c.lastMessage ?? c.subtitle ?? 'Say hello'}</span>
            {c.unread > 0 && (
              <span className="grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-gold-ink" aria-label={`${c.unread} unread`}>
                {c.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function Conversation({ contact, isStudent, onBack, onChanged }: { contact: DoubtContact; isStudent: boolean; onBack?: (() => void) | undefined; onChanged: () => Promise<void> }) {
  const { data: doubtThread, loading: doubtThreadLoading, error: doubtThreadError, callAPI: getDoubtThreadAPI } = useApi(getDoubtThread);
  const refreshThread = () => getDoubtThreadAPI(contact.id).then(() => undefined).catch(() => undefined);
  // Load the thread, then refresh every 5 seconds while the tab is visible (a failed refresh keeps the messages).
  useEffect(() => {
    getDoubtThreadAPI(contact.id).catch(() => undefined);
    const t = window.setInterval(() => {
      if (!document.hidden) getDoubtThreadAPI(contact.id).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(t);
  }, [contact.id, getDoubtThreadAPI]);
  const [pending, setPending] = useState<DoubtMessageRow[]>([]);
  const [text, setText] = useState('');
  const { loading: sendLoading, error: sendError, callAPI: sendDoubtMessageAPI } = useApi(sendDoubtMessage);
  const busy = sendLoading;
  const problem = sendError;
  const [info, setInfo] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const server = doubtThread?.messages ?? [];
  // A message I just sent shows at once; it is dropped from `pending` when the server copy arrives.
  const messages = useMemo(() => {
    const known = new Set(server.map((m) => m.id));
    return [...server, ...pending.filter((m) => !known.has(m.id))];
  }, [server, pending]);

  // Stick to the newest message.
  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);
  // Opening the conversation marks it read on the server, so refresh the unread badges.
  useEffect(() => {
    if (doubtThread) void onChanged();
  }, [doubtThread?.messages.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    let sent: DoubtMessageRow;
    try {
      sent = await sendDoubtMessageAPI(contact.id, body);
    } catch {
      return; // sendAction.error is shown under the messages
    }
    setPending((p) => [...p, sent]);
    setText('');
    void refreshThread();
    void onChanged();
    box.current?.focus();
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const c = doubtThread?.contact;
  return (
    <>
      <header className="flex items-center gap-2.5 bg-navy px-3 py-2.5 text-white">
        {onBack && <button type="button" className="rounded-ctl px-1.5 text-[18px] leading-none md:hidden" onClick={onBack} aria-label="Back to students">←</button>}
        <Avatar name={contact.name} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setInfo((v) => !v)} aria-expanded={info} aria-label={`${contact.name}: contact info`}>
          <b className="block truncate">{contact.name}</b>
          <span className="block truncate text-[11px] text-side-text">{contact.subtitle ?? (isStudent ? 'Your instructor' : 'Student')}</span>
        </button>
      </header>

      {info && c && (
        <div className="border-b border-line bg-card px-4 py-3" role="region" aria-label="Contact info">
          <b className="block">{c.name}</b>
          {c.subtitle && <span className="block text-muted">{c.subtitle}</span>}
          <a className="block text-navy underline" href={`mailto:${c.email}`}>{c.email}</a>
          {c.phone && <span className="block text-muted">{c.phone}</span>}
          {c.bio && <p className="mt-1.5 whitespace-pre-line">{c.bio}</p>}
        </div>
      )}

      <div className="doubt-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-6" role="log" aria-live="polite" aria-label={`Messages with ${contact.name}`}>
        {doubtThreadLoading && !doubtThread ? <p className="py-6 text-center text-muted">Loading messages…</p> :
          doubtThreadError && !doubtThread ? <ErrorBlock message={doubtThreadError} onRetry={refreshThread} /> :
          messages.length === 0 ? (
            <p className="mx-auto mt-6 w-fit max-w-sm rounded-ctl bg-pill-wa-bg px-3 py-2 text-center text-pill-wa">
              {isStudent ? 'Type your doubt below. Your instructor will reply here.' : 'No doubts from this student yet.'}
            </p>
          ) : (
            <MessageList messages={messages} />
          )}
        <div ref={bottom} />
      </div>

      {problem && <div className="border-t border-line bg-pill-bad-bg px-4 py-1.5 text-pill-bad" role="alert">{problem}</div>}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-page px-3 py-2.5">
        <textarea ref={box} rows={1} className="input max-h-32 min-h-[38px] flex-1 resize-none rounded-[20px] px-3.5 py-2" aria-label="Type your message"
          placeholder={isStudent ? 'Type your doubt' : 'Type a reply'} maxLength={2000} value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send message"
          className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full border border-gold bg-gold text-gold-ink disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12 2-12 2z" /></svg>
        </button>
      </form>
    </>
  );
}

function MessageList({ messages }: { messages: DoubtMessageRow[] }) {
  let lastDay = '';
  return (
    <ul className="flex flex-col gap-1">
      {messages.map((m) => {
        const d = new Date(m.createdAt);
        const key = d.toDateString();
        const showDay = key !== lastDay;
        lastDay = key;
        return (
          <li key={m.id} className="flex flex-col">
            {showDay && <span className="mx-auto my-2 rounded-ctl bg-card px-2.5 py-0.5 text-[11px] text-muted shadow-sm">{dayLabel(d)}</span>}
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] px-2.5 py-1.5 shadow-sm sm:max-w-[70%] ${
              m.mine ? 'self-end rounded-tr-[2px] bg-[#DDE3F7] text-ink' : 'self-start rounded-tl-[2px] border border-line-soft bg-card text-ink'}`}>
              {m.body}
              <span className="ml-2 inline-flex translate-y-[3px] items-center gap-1 align-bottom text-[10px] text-muted">
                {timeFmt.format(d)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
