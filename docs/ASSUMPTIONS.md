# Assumptions

## Phase 1
- Tailwind CSS **v3** (not v4) so the theme lives in `tailwind.config.ts`, as the brief describes.
- Design tokens come from the `.frame` (light mockup) CSS in the design files. The design pages' own dark-mode palette applies to the preview shell only, so the app is light-only in v1.
- Mockup body text is 12.5px; Tailwind's `text-base` is set to that size. Revisit in Phase 7 if the live app feels small.
- Nx targets are inferred from each package's `package.json` scripts (`serve`, `build`, `lint`, `typecheck`, `test`); project names are `web`, `api`, `shared`.
- The API is ESM, run in dev with `tsx` and bundled for build with `tsup` (which inlines `@lms/shared`).
- IDs are numeric (Prisma `Int` autoincrement), matching the Zod schemas.
- Course edit rule (to implement in Phase 4): editing the structure of a PUBLISHED course sends it back to PENDING.
- Permission keys and defaults live in `libs/shared/src/constants.ts` and are used by the seed script in Phase 2.
- `BUNDLE` is added to the purchase type alongside SINGLE and ANNUAL; plans table stays SINGLE | ANNUAL as specified.

## Phase 2
- The Prisma model for modules is `CourseModule` (mapped to table `Module`) to avoid clashing with the JS `module` name.
- The admin lives in the database only. `pnpm create-admin` (apps/api) prompts for name, email and password and stores the bcrypt hash; nothing admin-related is in `.env`. The server warns on start if no admin exists.
- Register logs the new student in straight away (returns a token).
- Changing a password returns a fresh token and clears `mustChangePassword`.
- "Remember me" stores the session in localStorage; unchecked keeps it in sessionStorage (this tab only).
- "Forgot password?" is display-only (no email in v1); the admin resets instructor passwords. Students have no reset flow in v1.
- The top-bar search box and the bell badge are visual only until Phase 7.
- Every menu item already has a route; pages other than dashboards show a "built in a later phase" card.
- Validation errors return HTTP 422 with `{ error: { code, message, details } }`.

## Phase 3
- Admin-only routes carry their guard per route (`authenticate` → `requirePasswordChanged` → `requireRole(ADMIN)`), not `router.use`, so later routers for other roles are never blocked.
- The admin row is never listed and cannot be edited, disabled, or have its password reset through the API.
- Reset password works for instructors and students (new temporary password, `mustChangePassword = true`). Students have no self-service reset in v1.
- Disabling an instructor keeps their students assigned; the Assign page marks the instructor "(disabled)" and does not allow new assignments to them.
- Bulk and single assignment only accept an active instructor. Choosing "Unassigned" clears the assignment.
- Permission changes are saved as a diff (only toggled cells are sent). The "+ New role" button is hidden (custom roles are a v1 non-goal).
- Audit entries written for: instructor create, user enable/disable, password reset, single/bulk assign, permission changes.
- `requirePermission(key)` exists and is used from Phase 4 onward on features gated by the matrix.

## Phase 4 (instructor and admin side)
- Editing is allowed while a course is DRAFT, REJECTED or PUBLISHED, and blocked while it is PENDING (under review).
- Changed again (latest): only the admin can publish or unpublish. Instructors press "Submit for approval" (course goes PENDING, needs at least one lesson and a final quiz question) and the admin approves or sends it back with a reason on the Approval page. Earlier phase 7 fix, now replaced: admin AND instructors could publish a course directly (needs at least one lesson and a final quiz question). Editing a PUBLISHED course keeps it live. Editing a REJECTED course turns it back into DRAFT. The old submit/approve/reject endpoints still work for courses already PENDING.
- Every instructor can see and edit every course. "Teaching" = courses selected (single, bundle or grant) by the students the admin assigned to them; a student with a live annual package counts for every published course.
- The certificate template is one database row (CertificateTemplate id 1). Until the admin saves it, the built-in navy and gold design is used. Run `pnpm prisma migrate dev` after pulling these changes.
- Unpublish (admin) returns a published course to DRAFT.
- Submitting requires at least one lesson and a final quiz with at least one question.
- Reordering uses up/down buttons (no drag and drop in v1). The API takes the full ordered id list.
- A course's quiz is saved as one unit: saving replaces its questions and options.
- Course creation, editing and submitting use `requirePermission` (course.create / course.edit.own / course.submit); the admin always passes.
- Video IDs and correct answers are only returned to the course's editors in `GET /courses/:id`; students get them later through the lesson and quiz endpoints.
- Approve, reject and submit create notifications (shown in the bell in Phase 7).

## Phase 4 (student catalog)
- `GET /courses` for students returns PUBLISHED courses only, with filters `search`, `category`, `level` and `sort` (`newest` = most recently approved, or `title`). Each item carries `access` (how the student can open it, or `null` when locked).
- No "Popular" sort or ratings in v1: there is no enrollment or rating data to rank by yet.
- The course detail page shows the curriculum and marks free-preview lessons, but no video plays there. Video IDs stay server-side until the Phase 6 lesson endpoint.
- `GET /courses/categories` (any signed-in user) lists categories of published courses; `GET /courses/options` (admin/instructor) lists published courses for pickers.

## Phase 5 (plans, checkout, access)
- **No schema change and no new migration.** Everything uses tables from Phase 1.
- Money is whole minor units (99900 = 999.00). Admin types prices in normal units; `toMinor`/`formatMoney` in `@lms/shared` convert. Currency comes from `CURRENCY` in `.env`.
- Three ways to buy: one price for any single course (Plan SINGLE), a bundle (own price), the annual package (Plan ANNUAL). Only students can check out; admin and instructor requests get 403.
- A **price change affects only new purchases**: each Purchase stores the amount paid.
- **Single course and bundle = lifetime access. Annual = 12 months** from the moment payment succeeds (`addMonths`, day clamped to month end). No auto-renewal in v1: when it ends the student buys it again.
- Access rule, in one place (`services/access.ts`): a student can open a course if they have an ACTIVE single purchase of it, an ACTIVE bundle purchase containing it, a live grant (not revoked, not expired), or a live annual package. Reported in that order. Phase 6 must use the same functions.
- Expiry is checked at read time (`endsAt > now`). The student's subscription page also marks overdue purchases EXPIRED; there is no cron job in v1.
- Checkout is two steps: `POST /checkout` creates a PENDING payment and purchase and returns the order (the price is read from the database, never from the browser); `POST /checkout/confirm` settles it. Confirming is idempotent and uses a conditional update so a double click cannot activate a purchase twice. An order must be confirmed within 30 minutes. Someone else's order id returns 404.
- Payment provider is behind an interface (`services/payments.ts`). Only `mock` is implemented. With `mock`, the pay screen offers "Pay" and "Simulate a declined payment" (the `simulate` field is ignored by real providers). Other `PAYMENT_PROVIDER` values return 501 until implemented.
- You cannot buy a course you already have access to, a bundle whose published courses you all have, or the annual package while one is active.
- Bundles hold at least 2 courses, all published when saved. Editing a bundle's courses replaces the list; existing buyers get whatever is in the bundle now. Students see a bundle with only its published courses, and bundles are switched off (not deleted).
- Plan and bundle management is admin-only in v1 (API checks role ADMIN plus the `plan.manage` key). Purchases list and sales numbers count completed purchases only; revenue is the sum of SUCCEEDED payments. There is no refund flow in v1.
- Grants: admin can grant any active student any published course. An instructor needs `grant.create` and can only grant to, list, and revoke for students assigned to them. A student cannot get a second live grant for the same course. Grants may have an end date (end of that day in the granter's time zone). Granting and revoking notify the student and are audited.
- Checkout and payment confirmation are rate limited (40 requests per 15 minutes per IP).

## Phase 6 (learning, quiz, certificates)
- **No schema change and no new migration.** One new dependency in the API: `pdfkit` (run `pnpm install`).
- **Layout:** the browser window never scrolls. The sidebar and top bar are fixed; only the page area (`<main>`) scrolls. On phones the sidebar is a drawer.
- **Access:** every learning endpoint uses the same `courseAccessFor` as the catalog. Students also need the `course.learn` permission (certificates need `certificate.view`). Instructors and admin do not use the student player.
- **Video IDs** leave the server only from `GET /lessons/:id`: for students with access, or for lessons marked Free preview (course must be PUBLISHED). Free previews are not tracked.
- **Lesson order:** lessons unlock in course order (modules, then lessons). The server enforces it on the lesson and progress endpoints, not just in the UI.
- **Completion:** a lesson completes when the video ends or at least 90% of its duration was watched. "Watched" counts only seconds the video was playing. v1 **trusts the numbers the browser reports** (position, watched seconds, duration); a determined student could fake them. Fixing that needs server-side video checks and is out of scope.
- **Resume:** the last position is saved every 5 seconds, on pause and when leaving; finishing a lesson resets it to the start.
- **Quiz rules:** unlocks only when every lesson is complete. One open attempt at a time (starting again resumes it). The timer is enforced on the server from `startedAt`; a submit later than the time limit plus 60 seconds scores 0 and its answers are discarded. An attempt that is never submitted is closed as failed when the student next opens the course, and uses up an attempt. No retakes after passing. Correct answers and explanations are shown only after submitting.
- **Certificates:** issued automatically on the first pass, once per student per course (unique in the database). Code looks like `LH-1A2B3-C4D5E`. PDF is built with built-in Helvetica, so names with non-Latin letters need an embedded font later. The verify page `/verify/:code` is public and rate limited; an unknown code answers `valid: false`.
- **Extra pages added here:** Quizzes, Certificates, My students (instructor). Doubts (student and instructor) replaced My instructor.

## Phase 7 (dashboards, notifications, polish)
- **No schema change and no new migration or package.**
- **"Real-time" = polling.** Dashboards refresh every 60 seconds and the bell every 30 seconds, only while the browser tab is visible. A failed background refresh keeps the last good data on screen. No WebSockets in v1.
- **Instructor dashboard definitions.** Learners = students with any lesson progress in the instructor's courses. Completion = finished lessons divided by (learners x lessons) per course; the headline figure is the average over courses that have learners. Avg quiz = mean score of submitted attempts (a timed-out attempt counts as 0). Recent activity is built from live data (certificates, pending courses, active learners), not a separate event log.
- **Student dashboard:** "Continue learning" follows the lesson touched most recently; "Upcoming quiz" is the first course with all lessons done, no pass yet and attempts left.
- **Admin dashboard:** revenue is the sum of successful payments in the configured currency; "active subscriptions" counts live annual, bundle and single purchases.
- **Notifications** are created for: course submitted, approved or rejected; payment received; grant given or revoked; certificate issued; instructor assigned (student and instructor). Each user only ever sees and marks their own.
- **Top-bar search** sends students and the admin to the course lists with `?search=`; instructors have no course search page, so they get no search box.
- **Accessibility pass:** skip-to-content link, visible keyboard focus, main menu landmark, Escape closes the bell and the phone drawer, progress bars and the bell badge have text alternatives, reduced-motion respected.
- **Not done: pixel comparison.** I cannot render the app or the design files, so the page-by-page visual comparison from the brief still needs a human look (open each design tab next to the matching page). Design tokens (colours, fonts, sizes) were taken from the design CSS in Phase 1.

## Latest changes (approval, progress, doubts)

- Doubts: a student with access to a course asks a doubt (optionally about one lesson). Their assigned instructor replies; the admin sees and can reply to every doubt. A student reply reopens it, an instructor or admin reply marks it Answered, and either side can mark it Resolved (no more replies after that). With no assigned instructor, the admin is notified. Menu item "Doubts" for all three roles; "Ask a doubt" buttons on the lesson page and My instructor page.
- Video progress: under the player the student sees time watched, a percentage bar with a marker at the 90% completion point, and whether the progress was saved.
- Needs a new migration: `cd apps/api && pnpm prisma migrate dev --name doubts`.

## Earlier changes (doubts, quizzes, admin pages)

- Doubts (one-to-one with the assigned instructor) replaces the old doubt page and My instructor. Run `cd apps/api && pnpm prisma migrate dev --name assignments_and_home` for the new tables. The old Doubt tables are kept so no data is lost, but nothing reads them any more.
- Student Subscription shows the plans (and bundles, only when some exist). Free access, plan status and purchase history were removed from that page.
- Quizzes list shows every quiz, including passed ones (best score, View result, Certificate). Submitting asks for a final confirmation; a timed-out quiz still submits automatically.
- Admin can create other admins on the Users page (Instructor or Admin role). The main admin is the oldest admin (the one set in `.env`) and, like your own account, cannot be disabled or reset from the Users page. New admins must change their temporary password at first login.
- Assign instructors is one table: each student shows Assigned or Not assigned, can be assigned one by one, or ticked and assigned as a group.
- Admin Plans shows only the two plans and recent purchases (with student name and email). Bundle creation is no longer on that page; existing bundles still work for students and through the API.
- Roles & permissions is the last item in the admin menu.

## Latest changes (landing page, assignments, doubts)

- Public landing page at `/`; admin picks up to 8 published courses in Home page courses (`Course.showOnHome`). Signed-in users see a "Go to my dashboard" button there instead of being redirected.
- Assignments: PDF only, 5 MB max, checked on the page and on the server (content type, `%PDF-` header, file name, size). Files live in the database. Flow Submitted -> Verifying -> Accepted/Rejected (reason required). Visible only to the student and their currently assigned instructor. No new permission keys: students need `course.learn`, instructors need `student.view.assigned`.
- Students no longer see a contact list on Doubts; instructors keep the WhatsApp style layout.


## Course assignments and certificates

- The instructor (or admin) adds assignments to a course in the course builder, like modules. Students submit one PDF per assignment.
- A student can send an assignment again only after the instructor rejected the previous submission.
- A certificate is issued only when the student has passed the quiz AND the instructor has accepted a submission for every assignment of the course. A course with no assignments needs only the quiz, as before.
- The certificate is issued automatically at the moment the last condition is met: when the quiz is passed, when the instructor accepts the last assignment, or when an assignment is removed from the course.
- Deleting a course assignment keeps the students' submissions (they just lose their link to it).
- The old free-form "pick a course and write a title" submission was replaced by choosing one of the course's assignments. Older submissions are still listed.
