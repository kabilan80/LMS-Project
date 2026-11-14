export const LESSON_COMPLETE_THRESHOLD = 0.9; // 90% watched counts as complete
export const ANNUAL_PLAN_MONTHS = 12;
export const MAX_PAGE_SIZE = 100;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_HOME_COURSES = 8; // courses the admin can show on the public home page
export const MAX_ASSIGNMENT_BYTES = 5 * 1024 * 1024; // assignments are PDF files up to 5 MB
export const MAX_ASSIGNMENT_MARKS = 100; // the instructor gives marks from 0 to 100 when accepting an assignment
export const CERTIFICATE_MIN_PERCENT = 70; // a certificate needs 70% or more in BOTH the assignments and the quiz
export const CERTIFICATE_STATUS = 'Accomplished'; // the status shown on the certificate pages (never marks or percentages)

// Permission keys used by the Roles & permissions matrix.
// ADMIN always has all of them; INSTRUCTOR and STUDENT are toggled in the UI.
export const PERMISSIONS = [
  { key: 'course.create', label: 'Create courses' },
  { key: 'course.edit.own', label: 'Edit own courses' },
  { key: 'course.submit', label: 'Submit and publish courses' },
  { key: 'course.approve', label: 'Approve or reject courses' },
  { key: 'student.view.assigned', label: 'View assigned students' },
  { key: 'grant.create', label: 'Grant course access' },
  { key: 'user.manage', label: 'Manage users' },
  { key: 'plan.manage', label: 'Manage plans and bundles' },
  { key: 'course.learn', label: 'Watch lessons and take quizzes' },
  { key: 'certificate.view', label: 'View own certificates' },
] as const;
export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

// Default role permissions applied by the seed script.
export const DEFAULT_ROLE_PERMISSIONS: Record<'INSTRUCTOR' | 'STUDENT', PermissionKey[]> = {
  INSTRUCTOR: ['course.create', 'course.edit.own', 'course.submit', 'student.view.assigned', 'grant.create'],
  STUDENT: ['course.learn', 'certificate.view'],
};

export const ROLE_HOME: Record<'ADMIN' | 'INSTRUCTOR' | 'STUDENT', string> = {
  ADMIN: '/admin/dashboard',
  INSTRUCTOR: '/instructor/dashboard',
  STUDENT: '/student/dashboard',
};

export interface NavItem {
  label: string;
  path: string;
  icon: 'home' | 'book' | 'play' | 'check' | 'award' | 'users' | 'edit' | 'doubt';
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Sidebar menus per role, copied from NAVS in the design files. Routes are also checked on the server. */
export const NAV: Record<'ADMIN' | 'INSTRUCTOR' | 'STUDENT', NavGroup[]> = {
  STUDENT: [
    {
      group: 'Learn',
      items: [
        { label: 'Dashboard', path: '/student/dashboard', icon: 'home' },
        { label: 'Courses', path: '/student/courses', icon: 'book' },
        { label: 'Quizzes', path: '/student/quizzes', icon: 'check' },
        { label: 'Assignments', path: '/student/assignments', icon: 'edit' },
        { label: 'Doubts', path: '/student/doubts', icon: 'doubt' },
        { label: 'Certificates', path: '/student/certificates', icon: 'award' },
      ],
    },
    {
      group: 'Account',
      items: [{ label: 'Subscription', path: '/student/subscription', icon: 'award' }],
    },
  ],
  INSTRUCTOR: [
    {
      group: 'Teach',
      items: [
        { label: 'Dashboard', path: '/instructor/dashboard', icon: 'home' },
        { label: 'My courses', path: '/instructor/courses', icon: 'edit' },
        { label: 'My students', path: '/instructor/students', icon: 'users' },
        { label: 'Assignments', path: '/instructor/assignments', icon: 'edit' },
        { label: 'Doubts', path: '/instructor/doubts', icon: 'doubt' },
        { label: 'Grant access', path: '/instructor/grants', icon: 'check' },
      ],
    },
  ],
  ADMIN: [
    {
      group: 'Admin',
      items: [
        { label: 'Dashboard', path: '/admin/dashboard', icon: 'home' },
        { label: 'Course approval', path: '/admin/approval', icon: 'check' },
        { label: 'All courses', path: '/admin/courses', icon: 'book' },
        { label: 'Users', path: '/admin/users', icon: 'users' },
        { label: 'Assign instructors', path: '/admin/assign', icon: 'users' },
        { label: 'Plans', path: '/admin/plans', icon: 'award' },
        { label: 'Grant access', path: '/admin/grants', icon: 'check' },
        { label: 'Certificates', path: '/admin/certificates', icon: 'award' },
        { label: 'Home page courses', path: '/admin/home-courses', icon: 'home' },
        { label: 'Roles & permissions', path: '/admin/roles', icon: 'award' },
      ],
    },
  ],
};

/** Extra seconds allowed after a quiz deadline for the request to arrive (slow networks). */
export const QUIZ_GRACE_SECONDS = 60;

/**
 * DEVELOPMENT ONLY. Test accounts for the quick-login buttons on the sign-in page.
 * Create them with `pnpm seed:dev` (apps/api). The buttons only appear in the Vite dev server, never in a production build.
 */
export const DEV_PASSWORD = 'Dev@12345';
export const DEV_LOGINS: Record<'ADMIN' | 'INSTRUCTOR' | 'STUDENT', { name: string; email: string; password: string }> = {
  ADMIN: { name: 'Dev Admin', email: 'admin@lms.dev', password: DEV_PASSWORD },
  INSTRUCTOR: { name: 'Dev Instructor', email: 'instructor@lms.dev', password: DEV_PASSWORD },
  STUDENT: { name: 'Dev Student', email: 'student@lms.dev', password: DEV_PASSWORD },
};
