const TONES = {
  ok: 'pill pill-ok',
  wait: 'pill pill-wait',
  bad: 'pill pill-bad',
  info: 'pill pill-info',
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={TONES[tone]}>{children}</span>;
}
