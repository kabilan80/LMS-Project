import { useEffect, useRef, type ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A small "are you sure?" box in the app's own style. Escape or the backdrop cancels.
 * Focus is set ONCE when the box opens: on its first text or number field when it has one (so typing just works), otherwise on Cancel.
 * It must never be moved again while the box is open, or typing in a field would jump to the Cancel button.
 */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Go back', busy = false, confirmDisabled = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The latest values, read by the key handler, so the handler (and the focus effect) never have to be set up again.
  const live = useRef({ busy, onCancel });
  live.current = { busy, onCancel };

  useEffect(() => {
    const field = boxRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea:not([disabled])');
    (field ?? cancelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !live.current.busy) live.current.onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-navy/50" onClick={busy ? undefined : onCancel} aria-hidden="true" />
      <div ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="card relative w-full max-w-sm shadow-drawer">
        <h3 id="confirm-title" className="mb-2 font-heading text-[16px] font-bold">{title}</h3>
        <div className="mb-4 flex flex-col gap-2">{children}</div>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn btn-gold disabled:opacity-60" disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
