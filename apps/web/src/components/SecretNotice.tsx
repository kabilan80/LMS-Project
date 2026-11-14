import { useState } from 'react';

interface SecretNoticeProps {
  title: string;
  password: string;
  onClose: () => void;
}

/** Shows a temporary password exactly once. Email is not built in v1, so the admin passes it on. */
export function SecretNotice({ title, password, onClose }: SecretNoticeProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="card border-gold bg-pill-wa-bg" role="status">
      <b className="block">{title}</b>
      <div className="my-2 flex items-center gap-2">
        <code className="rounded-ctl border border-line bg-white px-2.5 py-1.5 font-mono text-[14px] tracking-wide">{password}</code>
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="text-pill-wa">Shown only once. Give it to the user; they must change it at first sign-in.</p>
      <button className="btn mt-2" onClick={onClose}>I have saved it</button>
    </div>
  );
}
