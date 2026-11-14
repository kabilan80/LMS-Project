import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { NAV, Role } from '@lms/shared';
import { AppLayout } from './components/AppLayout';
import { ComingSoon } from './components/EmptyState';
import { RedirectIfSignedIn, RequireAuth, RequireRole } from './components/guards';
import { AdminDashboardPage } from './pages/admin/DashboardPage';
import { AssignInstructorsPage } from './pages/admin/AssignInstructorsPage';
import { RolesPage } from './pages/admin/RolesPage';
import { AllCoursesPage } from './pages/admin/AllCoursesPage';
import { ApprovalPage } from './pages/admin/ApprovalPage';
import { CourseBuilderPage } from './pages/CourseBuilderPage';
import { GrantsPage } from './pages/GrantsPage';
import { CertificatesAdminPage } from './pages/admin/CertificatesAdminPage';
import { PlansPage } from './pages/admin/PlansPage';
import { HomeCoursesPage } from './pages/admin/HomeCoursesPage';
import { LandingPage } from './pages/LandingPage';
import { CatalogPage } from './pages/student/CatalogPage';
import { CheckoutPage } from './pages/student/CheckoutPage';
import { CourseDetailPage } from './pages/student/CourseDetailPage';
import { SubscriptionPage } from './pages/student/SubscriptionPage';
import { CertificatesPage } from './pages/student/CertificatesPage';
import { LearnPage } from './pages/student/LearnPage';
import { PreviewPage } from './pages/student/PreviewPage';
import { DoubtsPage } from './pages/DoubtsPage';
import { StudentAssignmentsPage } from './pages/student/AssignmentsPage';
import { InstructorAssignmentsPage } from './pages/instructor/AssignmentsPage';
import { QuizPage } from './pages/student/QuizPage';
import { QuizResultPage } from './pages/student/QuizResultPage';
import { QuizzesPage } from './pages/student/QuizzesPage';
import { MyStudentsPage } from './pages/instructor/MyStudentsPage';
import { VerifyPage } from './pages/VerifyPage';
import { MyCoursesPage } from './pages/instructor/MyCoursesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { NotFoundPage, UnauthorizedPage } from './pages/auth/MessagePages';
import { RegisterPage } from './pages/auth/RegisterPage';
import { InstructorDashboardPage } from './pages/instructor/DashboardPage';
import { StudentDashboardPage } from './pages/student/DashboardPage';
import useApi from './hooks/useApi';
import { getMe } from './services/authService';
import { useAuthStore } from './store/authStore';

type RoleKey = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';

/** Pages built so far, by full path. Everything else in the menu shows a "later phase" card. */
const PAGES: Record<string, ReactElement> = {
  '/admin/users': <UsersPage />,
  '/admin/roles': <RolesPage />,
  '/admin/assign': <AssignInstructorsPage />,
  '/admin/approval': <ApprovalPage />,
  '/admin/courses': <AllCoursesPage />,
  '/admin/plans': <PlansPage />,
  '/admin/grants': <GrantsPage />,
  '/admin/home-courses': <HomeCoursesPage />,
  '/admin/certificates': <CertificatesAdminPage />,
  '/instructor/courses': <MyCoursesPage />,
  '/instructor/grants': <GrantsPage />,
  '/student/courses': <CatalogPage />,
  '/student/subscription': <SubscriptionPage />,
  '/student/quizzes': <QuizzesPage />,
  '/student/assignments': <StudentAssignmentsPage />,
  '/instructor/assignments': <InstructorAssignmentsPage />,
  '/student/doubts': <DoubtsPage />,
  '/instructor/doubts': <DoubtsPage />,
  '/student/certificates': <CertificatesPage />,
  '/instructor/students': <MyStudentsPage />,
};

/** Pages that are not menu items (opened from a list), relative to the role prefix. */
const EXTRA: Record<string, { path: string; element: ReactElement }[]> = {
  admin: [{ path: 'courses/:id', element: <CourseBuilderPage /> }],
  instructor: [{ path: 'courses/:id', element: <CourseBuilderPage /> }],
  student: [
    { path: 'courses/:id', element: <CourseDetailPage /> },
    { path: 'checkout', element: <CheckoutPage /> },
    { path: 'learn/:courseId', element: <LearnPage /> },
    { path: 'learn/:courseId/:lessonId', element: <LearnPage /> },
    { path: 'preview/:courseId/:lessonId', element: <PreviewPage /> },
    { path: 'quiz/:courseId', element: <QuizPage /> },
    { path: 'quiz-result/:attemptId', element: <QuizResultPage /> },
  ],
};

const GROUPS: { role: RoleKey; prefix: string; dashboard: ReactElement }[] = [
  { role: 'ADMIN', prefix: 'admin', dashboard: <AdminDashboardPage /> },
  { role: 'INSTRUCTOR', prefix: 'instructor', dashboard: <InstructorDashboardPage /> },
  { role: 'STUDENT', prefix: 'student', dashboard: <StudentDashboardPage /> },
];

export function App() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  // Refresh the user on load so role changes and disabled accounts take effect. A 401 signs out (see api.ts).
  const { callAPI: getMeAPI } = useApi(getMe);
  useEffect(() => {
    if (token) getMeAPI().then(setUser).catch(() => undefined);
  }, [token, setUser, getMeAPI]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
      <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      {/* Public: anyone can verify a certificate */}
      <Route path="/verify/:code" element={<VerifyPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>

      {/* /admin/*, /instructor/*, /student/*: each prefix has its own guard and the shared layout */}
      {GROUPS.map(({ role, prefix, dashboard }) => (
        <Route key={prefix} path={`/${prefix}`} element={<RequireRole roles={[Role[role]]} />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            {NAV[role]
              .flatMap((g) => g.items)
              .map((item) => {
                const sub = item.path.slice(prefix.length + 2); // "/admin/users" -> "users"
                return (
                  <Route
                    key={item.path}
                    path={sub}
                    element={sub === 'dashboard' ? dashboard : (PAGES[item.path] ?? <ComingSoon title={item.label} />)}
                  />
                );
              })}
            {(EXTRA[prefix] ?? []).map((x) => <Route key={x.path} path={x.path} element={x.element} />)}
          </Route>
        </Route>
      ))}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
