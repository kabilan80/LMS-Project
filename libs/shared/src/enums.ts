// String-valued enums shared by web and api. Values match the Prisma enums exactly.
export const Role = { ADMIN: 'ADMIN', INSTRUCTOR: 'INSTRUCTOR', STUDENT: 'STUDENT' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const CourseStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];

export const PlanType = { SINGLE: 'SINGLE', ANNUAL: 'ANNUAL' } as const;
export type PlanType = (typeof PlanType)[keyof typeof PlanType];

// What a Purchase was for. BUNDLE comes from the Bundle table, not Plan.
export const PurchaseType = { SINGLE: 'SINGLE', BUNDLE: 'BUNDLE', ANNUAL: 'ANNUAL' } as const;
export type PurchaseType = (typeof PurchaseType)[keyof typeof PurchaseType];

export const PurchaseStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;
export type PurchaseStatus = (typeof PurchaseStatus)[keyof typeof PurchaseStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const CourseLevel = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
} as const;
export type CourseLevel = (typeof CourseLevel)[keyof typeof CourseLevel];

/** Why a student can open a course. ANNUAL covers every published course while the package is active. */
export const AccessSource = { SINGLE: 'SINGLE', BUNDLE: 'BUNDLE', ANNUAL: 'ANNUAL', GRANT: 'GRANT' } as const;
export type AccessSource = (typeof AccessSource)[keyof typeof AccessSource];

/** Assignment flow: the student submits, the assigned instructor verifies it, then accepts or rejects it (with a reason). */
export const AssignmentStatus = { SUBMITTED: 'SUBMITTED', VERIFYING: 'VERIFYING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' } as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];
