import { z } from 'zod';
import { AssignmentStatus, CourseLevel, CourseStatus, PlanType, Role } from './enums';
import { MAX_ASSIGNMENT_MARKS, MAX_PAGE_SIZE, MIN_PASSWORD_LENGTH } from './constants';
import { parseYouTubeId } from './youtube';

const password = z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`).max(72);
const email = z.string().trim().toLowerCase().email();
const id = z.coerce.number().int().positive();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

// ---- Auth ----
export const loginSchema = z.object({ email, password: z.string().min(1) });
export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    password,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different',
  });

// ---- Users (admin) ----
/**
 * Create an admin, an instructor or a student. Expertise is only needed (and only kept) for instructors.
 * The role may come from the dropdown or be typed by hand, so it is trimmed and upper-cased before it is checked.
 */
export const createUserSchema = z
  .object({
    role: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
      z.enum([Role.ADMIN, Role.INSTRUCTOR, Role.STUDENT], { errorMap: () => ({ message: 'Role must be admin, instructor or student' }) }),
    ),
    name: z.string().trim().min(2).max(100),
    email,
    expertise: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(30).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === Role.INSTRUCTOR && (v.expertise?.length ?? 0) < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expertise'], message: 'Enter the instructor expertise' });
    }
  });
export const listUsersQuery = paginationQuery.extend({
  search: z.string().trim().optional(),
  role: z.enum([Role.ADMIN, Role.INSTRUCTOR, Role.STUDENT]).optional(),
  active: z.enum(['true', 'false']).optional(),
  unassigned: z.enum(['true', 'false']).optional(), // students: 'true' = no instructor, 'false' = has one
  instructorId: z.coerce.number().int().positive().optional(), // students of one instructor
});
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    expertise: z.string().trim().min(2).max(200).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const assignInstructorSchema = z.object({ instructorId: id.nullable() });
export const assignManySchema = z.object({
  studentIds: z.array(id).min(1).max(500),
  instructorId: id,
});

// ---- Courses ----
export const courseInputSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(1).max(5000),
  category: z.string().trim().min(1).max(80),
  level: z.nativeEnum(CourseLevel),
  thumbnailUrl: z.string().url().optional(),
  passMark: z.number().int().min(1).max(100).default(70),
  maxAttempts: z.number().int().min(1).max(20).default(3),
});
export const rejectCourseSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
export const moduleInputSchema = z.object({ title: z.string().trim().min(1).max(150) });
/** An assignment the instructor/admin sets for a course, like a module. Students submit a PDF against it. */
export const courseAssignmentInputSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(150),
  description: z.string().trim().max(2000).optional(),
});
export const lessonInputSchema = z.object({
  title: z.string().trim().min(1).max(150),
  youtubeUrl: z
    .string()
    .trim()
    .refine((v) => parseYouTubeId(v) !== null, 'Enter a valid YouTube link'),
  durationSeconds: z.number().int().min(0).optional(),
  isPreview: z.boolean().default(false),
  notes: z.string().max(5000).optional(),
});
export const reorderSchema = z.object({ orderedIds: z.array(id).min(1) });

// ---- Quiz ----
export const quizInputSchema = z.object({
  title: z.string().trim().min(1).max(150),
  timeLimitMinutes: z.number().int().min(1).max(240),
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        explanation: z.string().optional(),
        options: z
          .array(z.object({ text: z.string().trim().min(1), isCorrect: z.boolean() }))
          .min(2)
          .max(6)
          .refine((o) => o.filter((x) => x.isCorrect).length === 1, 'Exactly one correct option'),
      }),
    )
    .min(1),
});
export const submitQuizSchema = z.object({
  answers: z.array(z.object({ questionId: id, optionId: id.nullable() })),
});

// ---- Plans, checkout, grants ----
export const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  priceMinor: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
export const bundleInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  priceMinor: z.number().int().min(0),
  courseIds: z.array(id).min(2),
  active: z.boolean().default(true),
});
export const checkoutSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(PlanType.SINGLE), courseId: id }),
  z.object({ type: z.literal('BUNDLE'), bundleId: id }),
  z.object({ type: z.literal(PlanType.ANNUAL) }),
]);
// `simulate` only has an effect with the mock payment provider (lets you test a declined payment).
export const confirmCheckoutSchema = z.object({
  orderId: z.string().min(1).max(191),
  simulate: z.enum(['success', 'decline']).default('success'),
});
export const updateBundleSchema = bundleInputSchema.partial();
export const planTypeParam = z.object({ type: z.nativeEnum(PlanType) });
export const listGrantsQuery = paginationQuery.extend({
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(), // inactive = revoked or expired
});
export const grantStudentsQuery = z.object({ search: z.string().trim().max(100).optional() });
export const listBundlesQuery = z.object({ courseId: id.optional() });
export const createGrantSchema = z.object({
  studentId: id,
  courseId: id,
  reason: z.string().trim().max(500).optional(),
  expiresAt: z.coerce.date().optional(),
});
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1E2A5E');
export const certificateTemplateSchema = z.object({
  orgName: z.string().trim().min(1, 'Enter a name').max(80),
  title: z.string().trim().min(1, 'Enter a title').max(80),
  introText: z.string().trim().min(1, 'Enter some text').max(120),
  courseText: z.string().trim().min(1, 'Enter some text').max(120),
  signerName: z.string().trim().max(80),
  signerTitle: z.string().trim().max(80),
  footerNote: z.string().trim().max(160),
  primaryColor: hexColor,
  accentColor: hexColor,
  showScore: z.boolean(),
});
export type CertificateTemplateInput = z.infer<typeof certificateTemplateSchema>;
export const listCertificatesQuery = paginationQuery.extend({ search: z.string().trim().max(100).optional() });
export const updatePermissionsSchema = z.object({
  changes: z.array(
    z.object({
      role: z.enum([Role.INSTRUCTOR, Role.STUDENT]),
      permissionKey: z.string().min(1),
      allowed: z.boolean(),
    }),
  ),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CourseInput = z.infer<typeof courseInputSchema>;
export type LessonInput = z.infer<typeof lessonInputSchema>;
export type QuizInput = z.infer<typeof quizInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const courseListQuery = paginationQuery.extend({
  search: z.string().trim().optional(),
  status: z.nativeEnum(CourseStatus).optional(),
  category: z.string().trim().max(80).optional(),
  level: z.nativeEnum(CourseLevel).optional(),
  sort: z.enum(['newest', 'title']).default('newest'),
  /** Instructors only: `teaching` = courses their assigned students selected. */
  scope: z.enum(['all', 'teaching']).optional(),
});
export const updateCourseSchema = courseInputSchema.partial();
export const updateLessonSchema = lessonInputSchema.partial();
export type CourseAssignmentInput = z.infer<typeof courseAssignmentInputSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type BundleInput = z.infer<typeof bundleInputSchema>;
export type UpdateBundleInput = z.infer<typeof updateBundleSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreateGrantInput = z.infer<typeof createGrantSchema>;

// ---- Learning ----
export const progressSchema = z.object({
  positionSeconds: z.number().int().min(0).max(86400),
  watchedSeconds: z.number().int().min(0).max(86400),
  durationSeconds: z.number().int().min(1).max(86400).optional(),
  ended: z.boolean().optional(),
});
export type ProgressInput = z.infer<typeof progressSchema>;
export type SubmitQuizInput = z.infer<typeof submitQuizSchema>;

// ---- Doubts (student <-> assigned instructor) ----
export const sendDoubtSchema = z.object({
  toId: id,
  body: z.string().trim().min(1, 'Write a message').max(2000),
});
export const doubtThreadQuery = z.object({ withId: id });
export type SendDoubtInput = z.infer<typeof sendDoubtSchema>;

// ---- Assignments ----
/** The PDF itself is the request body; these details travel in the query string. */
export const submitAssignmentQuery = z.object({
  courseAssignmentId: id,
  note: z.string().trim().max(1000).optional(),
  fileName: z.string().trim().min(1).max(200),
});
export const acceptAssignmentSchema = z.object({
  marks: z.number({ invalid_type_error: 'Enter the marks (0 to 100)', required_error: 'Enter the marks (0 to 100)' }).int('Marks must be a whole number').min(0, 'Marks cannot be below 0').max(MAX_ASSIGNMENT_MARKS, `Marks cannot be above ${MAX_ASSIGNMENT_MARKS}`),
  /** Optional comment the student sees with their marks. */
  feedback: z.string().trim().max(1000, 'Feedback can be at most 1000 characters').optional(),
});
export const rejectAssignmentSchema = z.object({ reason: z.string().trim().min(3, 'Write the reason (at least 3 characters)').max(1000) });
export const listAssignmentsQuery = paginationQuery.extend({
  status: z.nativeEnum(AssignmentStatus).optional(),
});

// ---- Public home page ----
export const homeCourseSchema = z.object({ show: z.boolean() });
