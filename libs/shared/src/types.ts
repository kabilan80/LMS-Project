import type {
  AccessSource,
  AssignmentStatus,
  CourseLevel,
  CourseStatus,
  PaymentStatus,
  PlanType,
  PurchaseStatus,
  PurchaseType,
  Role,
} from './enums';

/** Shape of the JWT payload. Role and id always come from here, never from request bodies. */
export interface AuthTokenPayload {
  sub: number;
  role: Role;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Consistent error body for every failed API call. */
export interface ApiError {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  phone: string | null;
  expertise: string | null;
  instructorId: number | null;
  instructorName: string | null;
  studentCount: number;
  /** True for accounts the admin cannot change here: yourself and the main admin set in .env. */
  locked: boolean;
  createdAt: string;
}

export interface CreatedUser {
  user: UserRow;
  temporaryPassword: string; // shown once, never stored in plain text
}

export interface InstructorRow {
  id: number;
  name: string;
  expertise: string | null;
  active: boolean;
  studentCount: number;
}

export interface PermissionMatrix {
  permissions: { key: string; label: string }[];
  roles: { INSTRUCTOR: Record<string, boolean>; STUDENT: Record<string, boolean> };
}

export interface CourseListItem {
  id: number;
  title: string;
  slug: string;
  category: string;
  level: CourseLevel;
  status: CourseStatus;
  thumbnailUrl: string | null;
  rejectionReason: string | null;
  creator: { id: number; name: string };
  /** Instructors only: how many of their assigned students selected (bought or were granted) this course. */
  myStudents?: number;
  moduleCount: number;
  lessonCount: number;
  submittedAt: string | null;
  updatedAt: string;
  /** Students only: how they can open this course, or null when it is locked. */
  access?: AccessSource | null;
}

export interface LessonDetail {
  id: number;
  title: string;
  order: number;
  durationSeconds: number | null;
  isPreview: boolean;
  notes: string | null;
  /** Only sent to the course's editors (creator/admin). Students get video IDs from the lesson endpoint. */
  youtubeUrl?: string;
  youtubeId?: string;
}

export interface ModuleDetail {
  id: number;
  title: string;
  order: number;
  lessons: LessonDetail[];
}

export interface QuizDetail {
  id: number;
  title: string;
  timeLimitMinutes: number;
  questions: {
    id: number;
    text: string;
    order: number;
    explanation: string | null;
    options: { id: number; text: string; isCorrect?: boolean }[]; // isCorrect only for editors
  }[];
}

/** An assignment set by the instructor/admin for a course. */
export interface CourseAssignmentDetail {
  id: number;
  title: string;
  description: string | null;
  order: number;
}

export interface CourseDetail extends Omit<CourseListItem, 'moduleCount' | 'lessonCount'> {
  description: string;
  passMark: number;
  maxAttempts: number;
  approvedAt: string | null;
  canEdit: boolean;
  /** Students only: how they can open this course, or null when it is locked. */
  access?: AccessSource | null;
  modules: ModuleDetail[];
  assignments: CourseAssignmentDetail[];
  quiz: QuizDetail | null;
}

// ---- Plans, bundles, checkout, access ----
export interface PlanItem {
  id: number;
  type: PlanType;
  name: string;
  priceMinor: number;
  currency: string;
  active: boolean;
}

export interface BundleItem {
  id: number;
  name: string;
  priceMinor: number;
  currency: string;
  active: boolean;
  courses: { id: number; title: string; published: boolean }[];
  /** Students only: true when they already have access to every published course in the bundle. */
  owned?: boolean;
}

export interface CourseOption {
  id: number;
  title: string;
  category: string;
}

/** What the student sees before paying. Prices come from the database, never from the browser. */
export interface CheckoutOrder {
  orderId: string;
  type: PurchaseType;
  title: string;
  amountMinor: number;
  currency: string;
  provider: string;
  testMode: boolean;
}

export interface CheckoutResult {
  status: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED'>;
  type: PurchaseType;
  courseId: number | null;
  title: string;
  endsAt: string | null;
}

export interface PurchaseRow {
  id: number;
  type: PurchaseType;
  status: PurchaseStatus;
  title: string;
  amountMinor: number;
  currency: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  student?: { id: number; name: string; email: string };
}

export interface GrantRow {
  id: number;
  student: { id: number; name: string; email: string };
  course: { id: number; title: string };
  grantedBy: { id: number; name: string };
  reason: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export interface MyAccess {
  annual: { endsAt: string } | null;
  purchases: PurchaseRow[];
  grants: GrantRow[];
}

export interface SalesSummary {
  currency: string;
  activeAnnual: number;
  activeBundles: number;
  activeSingles: number;
  revenueMinor: number;
}

export interface GrantStudent {
  id: number;
  name: string;
  email: string;
}

// ---- Learning (Phase 6) ----
export interface MyCourse {
  id: number;
  title: string;
  category: string;
  level: CourseLevel;
  thumbnailUrl: string | null;
  totalLessons: number;
  completedLessons: number;
  allLessonsDone: boolean;
  nextLessonId: number | null;
  hasQuiz: boolean;
  quizPassed: boolean;
  quizAttemptsUsed: number;
  /** Best score over all submitted attempts, or null when none yet. */
  quizBestPercent: number | null;
  /** Most recent submitted attempt, for the "View result" link. */
  lastAttemptId: number | null;
  maxAttempts: number;
  certificateId: number | null;
}

export interface LearnLesson {
  id: number;
  title: string;
  moduleTitle: string;
  number: number; // 1..n across the whole course
  durationSeconds: number | null;
  completed: boolean;
  locked: boolean;
  isPreview: boolean;
}

export interface LearnState {
  course: { id: number; title: string; passMark: number; maxAttempts: number };
  lessons: LearnLesson[];
  allCompleted: boolean;
  quiz: {
    exists: boolean;
    title: string | null;
    questionCount: number;
    timeLimitMinutes: number | null;
    attemptsUsed: number;
    passed: boolean;
    certificateId: number | null;
    openAttemptId: number | null;
    /** Course assignments the instructor has not accepted yet. The certificate waits for these. */
    assignmentsPending: number;
    /** All assignments are accepted but the average marks are below the 70% a certificate needs. */
    assignmentsBelowMin: boolean;
  };
}

export interface LessonPlayback {
  id: number;
  title: string;
  courseId: number;
  courseTitle: string;
  youtubeId: string;
  lastPositionSeconds: number;
  completed: boolean;
  durationSeconds: number | null;
  /** True when the student has no access and this is a free preview lesson. */
  previewOnly: boolean;
  nextLessonId: number | null;
}

export interface ProgressResult {
  completed: boolean;
  allCompleted: boolean;
  nextLessonId: number | null;
  saved: boolean;
}

export interface QuizStart {
  attemptId: number;
  courseId: number;
  title: string;
  startedAt: string;
  deadline: string;
  timeLimitMinutes: number;
  questions: { id: number; text: string; options: { id: number; text: string }[] }[];
}

export interface QuizResult {
  attemptId: number;
  courseId: number;
  courseTitle: string;
  scorePercent: number;
  passed: boolean;
  passMark: number;
  correct: number;
  total: number;
  submittedAt: string;
  certificateId: number | null;
  /** Passed the quiz but the certificate waits for the instructor to accept these assignments. */
  assignmentsPending: number;
  assignmentsRequired: number;
  /** All assignments are accepted but the average marks are below the 70% a certificate needs. */
  assignmentsBelowMin: boolean;
  attemptsUsed: number;
  maxAttempts: number;
  timedOut: boolean;
  review: {
    questionId: number;
    text: string;
    explanation: string | null;
    selectedOptionId: number | null;
    correctOptionId: number | null;
    options: { id: number; text: string }[];
  }[];
}

export interface CertificateRow {
  id: number;
  code: string;
  courseId: number;
  courseTitle: string;
  studentName: string;
  /** "Accomplished". Certificates never show marks, percentages or grades. */
  status: string;
  issuedAt: string;
}

/** One step of the certificate checklist. "na" = nothing to do for this course (e.g. no assignments set). */
export type ProgressState = 'done' | 'pending' | 'failed' | 'na';

/** Student: how close they are to the certificate of one course (lessons, quiz, assignments). */
export interface CertificateProgress {
  courseId: number;
  courseTitle: string;
  /** ACCOMPLISHED = certificate issued; NOT_ELIGIBLE = a step ended below 70% (or out of quiz attempts). */
  status: 'ACCOMPLISHED' | 'IN_PROGRESS' | 'NOT_ELIGIBLE';
  certificateId: number | null;
  certificateCode: string | null;
  lessons: { done: number; total: number; state: ProgressState };
  quiz: { exists: boolean; bestPercent: number | null; attemptsUsed: number; maxAttempts: number; state: ProgressState };
  assignments: { required: number; accepted: number; averagePercent: number | null; state: ProgressState };
  /** Steps finished out of 3 (lessons, quiz, assignments). */
  stepsDone: number;
}

export interface CertificateTemplate {
  orgName: string;
  title: string;
  introText: string;
  courseText: string;
  signerName: string;
  signerTitle: string;
  footerNote: string;
  primaryColor: string;
  accentColor: string;
  /** No longer shown anywhere (certificates carry no marks); kept so saved templates stay valid. */
  showScore: boolean;
}

export const DEFAULT_CERTIFICATE_TEMPLATE: CertificateTemplate = {
  orgName: 'LEARNHUB',
  title: 'Certificate of Completion',
  introText: 'This certifies that',
  courseText: 'has successfully completed the course',
  signerName: '',
  signerTitle: '',
  footerNote: '',
  primaryColor: '#1E2A5E',
  accentColor: '#F2A900',
  showScore: true,
};

export interface AdminCertificateRow extends CertificateRow {
  studentEmail: string;
}

export interface VerifyResponse {
  valid: boolean;
  code?: string;
  studentName?: string;
  courseTitle?: string;
  status?: string;
  issuedAt?: string;
}

export interface MyStudentRow {
  id: number;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
  lessonsCompleted: number;
  certificates: number;
  activeGrants: number;
  /** Courses this student selected: bought (single or bundle) or was granted. Annual covers every course, see annualUntil. */
  courses: { id: number; title: string; source: Exclude<AccessSource, 'ANNUAL'> }[];
  /** ISO date the annual package ends, or null. While it is in the future the student can open every published course. */
  annualUntil: string | null;
}

// ---- Dashboards and notifications (Phase 7) ----
export interface NotificationRow {
  id: number;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationsResponse {
  items: NotificationRow[];
  unread: number;
}

export interface StudentDashboard {
  plan: {
    annualUntil: string | null;
    /** Courses opened by single purchases, bundles or grants (not counting the annual package). */
    individualCourses: number;
    accessibleCourses: number;
  };
  continueLearning: {
    courseId: number;
    courseTitle: string;
    lessonId: number;
    lessonTitle: string;
    completedLessons: number;
    totalLessons: number;
  } | null;
  upcomingQuiz: { courseId: number; courseTitle: string; attemptsLeft: number } | null;
  courses: MyCourse[];
  certificates: number;
}

export interface InstructorCourseStat {
  id: number;
  title: string;
  status: CourseStatus;
  learners: number;
  completionPercent: number | null;
  avgQuizPercent: number | null;
}
export interface InstructorDashboard {
  courses: { total: number; draft: number; pending: number; published: number; rejected: number };
  learners: number;
  avgCompletionPercent: number | null;
  assignedStudents: number;
  certificatesIssued: number;
  stats: InstructorCourseStat[];
  activity: { id: string; text: string; at: string }[];
}

export interface AdminDashboard {
  users: { students: number; instructors: number; unassignedStudents: number };
  courses: { published: number; pending: number };
  sales: SalesSummary;
  pendingCourses: { id: number; title: string; creatorName: string; submittedAt: string | null }[];
  recentPurchases: PurchaseRow[];
}

// ---- Doubts (student <-> assigned instructor) ----
export interface DoubtContact {
  id: number;
  name: string;
  /** Instructor: their expertise. Student: their email. */
  subtitle: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

export interface DoubtMessageRow {
  id: number;
  /** True when the signed-in user wrote it. */
  mine: boolean;
  /** For my own messages: the other person has opened the conversation since I sent it. */
  read: boolean;
  body: string;
  createdAt: string;
}

export interface DoubtThread {
  contact: { id: number; name: string; subtitle: string | null; email: string; phone: string | null; bio: string | null };
  messages: DoubtMessageRow[];
}

// ---- Assignments ----
export interface AssignmentRow {
  id: number;
  /** The course assignment this answers (null for older free-form submissions). */
  courseAssignmentId: number | null;
  title: string;
  note: string | null;
  courseId: number;
  courseTitle: string;
  studentId: number;
  studentName: string;
  fileName: string;
  fileSize: number;
  status: AssignmentStatus;
  /** Only when rejected. */
  rejectReason: string | null;
  /** Marks (0 to 100) the instructor gave when grading this attempt; null until then (and for a plain rejection). */
  marks: number | null;
  /** The instructor's comment on this attempt (optional). */
  feedback: string | null;
  /** Which try this submission is for the assignment (1, 2, 3...). */
  attemptNo: number;
  /** Attempts allowed for this assignment (the course's attempt limit, like quizzes). */
  maxAttempts: number;
  /** Marks needed to pass (the course pass mark, never below 70). */
  passMark: number;
  createdAt: string;
  updatedAt: string;
}

/** Student: an assignment set for a course they can open, with the state of their latest submission. */
export interface AssignmentTask {
  id: number;
  courseId: number;
  courseTitle: string;
  title: string;
  description: string | null;
  /** Status of the student's most relevant submission, or null when nothing was sent yet. */
  myStatus: AssignmentStatus | null;
  /** Attempt numbers, like the quiz: submissions sent, attempts allowed and attempts left (0 once passed). */
  attemptsUsed: number;
  maxAttempts: number;
  attemptsLeft: number;
  /** Marks needed to pass. */
  passMark: number;
  /** False when passed, waiting for review, or out of attempts; `blockedReason` says why. */
  canSubmit: boolean;
  blockedReason: string | null;
}

// ---- Public home page ----
export interface HomeCourse {
  id: number;
  title: string;
  category: string;
  level: CourseLevel;
  description: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  teacherName: string;
}
export interface HomePageData {
  stats: { courses: number; students: number; certificates: number };
  courses: HomeCourse[];
  plans: PlanItem[];
}
/** Admin: every published course, with whether it is shown on the public home page. */
export interface HomeCourseOption {
  id: number;
  title: string;
  category: string;
  level: CourseLevel;
  teacherName: string;
  showOnHome: boolean;
}
