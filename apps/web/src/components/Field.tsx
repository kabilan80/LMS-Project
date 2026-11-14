import { useState, type InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
}

export function Field({ label, error, id, type, ...rest }: FieldProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const isPassword = type === 'password';
  const [shown, setShown] = useState(false);
  return (
    <div className="mb-[9px]">
      <label htmlFor={inputId} className="mb-[3px] block text-xs font-semibold">{label}</label>
      {isPassword ? (
        <div className="relative">
          <input id={inputId} aria-invalid={!!error} type={shown ? 'text' : 'password'}
            className={`input pr-16 ${error ? 'border-danger' : ''}`} {...rest} />
          <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown}
            aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            className="absolute inset-y-0 right-0 rounded-r-ctl px-3 text-[12px] font-semibold text-muted hover:text-ink">
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : (
        <input id={inputId} aria-invalid={!!error} type={type} className={`input ${error ? 'border-danger' : ''}`} {...rest} />
      )}
      {error && <p className="mt-1 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 rounded-ctl border border-pill-bad-bg bg-pill-bad-bg px-3 py-2 text-pill-bad">
      {message}
    </div>
  );
}
