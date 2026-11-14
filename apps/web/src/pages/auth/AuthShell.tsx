import type { ReactNode } from 'react';
import { Brand } from '../../components/Icon';

/** Split screen from the login design: navy pitch on the left, form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-center gap-3.5 bg-navy p-10 text-white md:flex">
        <Brand />
        <h3 className="font-heading text-[28px] font-bold leading-[1.15]">
          Learn at your pace.<br />Earn your certificate.
        </h3>
        <div>Courses, video lessons, quizzes and certificates in one place.</div>
      </div>
      <div className="grid place-items-center bg-card p-6">
        <div className="w-[320px] max-w-full">
          <Brand className="mb-6 !text-navy md:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
