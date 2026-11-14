import { Link } from 'react-router-dom';
import { ROLE_HOME } from '@lms/shared';
import { useAuthStore } from '../../store/authStore';

function Message({ code, title, text }: { code: string; title: string; text: string }) {
  const user = useAuthStore((s) => s.user);
  // Signed-in users go straight to their own dashboard; visitors go to the public home page.
  const home = user ? (user.mustChangePassword ? '/change-password' : ROLE_HOME[user.role]) : '/';
  return (
    <main className="grid min-h-screen place-items-center bg-page p-6">
      <div className="card max-w-sm text-center">
        <div className="font-heading text-[40px] font-bold text-navy">{code}</div>
        <h1 className="font-heading text-lg font-bold">{title}</h1>
        <p className="mb-4 mt-1 text-muted">{text}</p>
        <Link to={home} replace className="btn btn-primary">{user ? 'Go to my dashboard' : 'Go to home page'}</Link>
      </div>
    </main>
  );
}

export const UnauthorizedPage = () => (
  <Message code="403" title="Not allowed" text="Your account does not have access to that page." />
);
export const NotFoundPage = () => (
  <Message code="404" title="Page not found" text="The page you are looking for does not exist." />
);
