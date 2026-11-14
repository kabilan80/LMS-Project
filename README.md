# Learning Management System

One website, three roles (Admin, Instructor, Student). React + Vite + Tailwind frontend, Express + Prisma + MySQL backend, shared TypeScript library, Nx + pnpm monorepo.

> Status: **Phase 7 (dashboards, notifications, polish)** plus fixes (plans, grants, instructor access, certificates template, focus colors, locked quiz card, one-section assign page, simpler code names, submit for approval, video progress bar, student doubts, doubts page fixed and admin doubts removed, Playwright browser tests). Phase 8 (hardening) remains. See `docs/ASSUMPTIONS.md`.

## Layout

| Folder | Purpose |
| --- | --- |
| `apps/web` | React frontend (components, pages, store, hooks, services) |
| `apps/api` | Express API (`config` env + database, `lib` jwt/password/audit/admin helpers, `routes`, `middleware`, `controllers`, `services`, `prisma`) |
| `libs/shared` | Enums, Zod schemas, constants, types used by both apps (`@lms/shared`) |
| `docs/design` | The 3 role design files. Reference only, never imported |

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # then edit values
cp apps/web/.env.example apps/web/.env
pnpm nx serve api     # http://localhost:4000/api/health
pnpm nx serve web     # http://localhost:4200
```

Database (MySQL must be running; create an empty database named `lms` first):

```bash
cd apps/api
pnpm prisma migrate dev --name init   # creates all tables (re-run `pnpm prisma migrate dev --name certificate_template` if you already have a database)
pnpm prisma db seed                   # permissions and plans
pnpm create-admin                     # asks for the admin name, email and password; stored in the database only
cd ../..
```

If you already ran the first migration, add the new tables with `pnpm prisma migrate dev --name assignments_and_home` (run from `apps/api`).

**Required for this update (course assignments).** Add the new `CourseAssignment` table and column, then restart the API:

```bash
cd apps/api
pnpm prisma migrate dev --name course_assignments
```

**Development quick login.** To get the Admin / Instructor / Student buttons on the sign-in page working, create the three test accounts once (development only, password `Dev@12345`):

```bash
cd apps/api
pnpm seed:dev      # admin@lms.dev, instructor@lms.dev, student@lms.dev (the student is assigned to the instructor)
```

The buttons only appear in the Vite dev server (`import.meta.env.DEV`), never in a production build.

**Console logs.** The API terminal prints `[API] METHOD url -> controllerFunction` with the user and request data for every call, plus tagged steps such as `[certificate]`, `[assignment]`, `[quiz]`, `[users]`. The browser console prints `[API →]` / `[API ←]` for requests and responses, `[useApi]` for which service a page called, and `[LoginPage]`, `[UsersPage]`, ... for page steps. Passwords and tokens are hidden.

Sign in at http://localhost:4200 with the admin email and password you entered in `pnpm create-admin`.

## Checks

```bash
pnpm nx run-many -t typecheck lint test build
```

## Browser tests (Playwright)

`pnpm e2e` drives the real app in Chromium: sign in/register/forced password change, every menu page of every
role, admin (users, assign, approval, plans, roles), instructor (courses, grants), student (catalog, test payment,
lessons, quiz, certificate, verify page), doubts, assignments, home page, API access rules, XSS and a phone-size layout check.

```bash
pnpm install
pnpm e2e:install        # one time: downloads Chromium
pnpm e2e                # starts its own API (4100) + web (4300) on the database `lms_e2e`
pnpm e2e:report         # open the HTML report after a run
```

- MySQL must be running. By default the tests use `mysql://root:password@localhost:3306/lms_e2e`; set
  `E2E_DATABASE_URL` to change it. The database name **must end in `_e2e`**: it is wiped and rebuilt on every run
  (the runner refuses any other name), so your development data in `lms` is never touched.
- The test API runs with `DISABLE_RATE_LIMITS=true` so many sign-ins in a row are allowed. Never set that in production.
- One spec: `pnpm e2e e2e/tests/06-doubts.spec.ts`. Watch the browser: `pnpm e2e --headed`.

## Doubts

Students and instructors have a **Doubts** page (it replaces the old doubt and My instructor pages). A student has one
instructor, so they see just the conversation with that instructor and type their doubt at the bottom. An instructor
sees a WhatsApp Desktop style layout: assigned students on the left, the conversation on the right, in the LearnHub
colours. Messages refresh every few seconds, unread counts show in the list, and ticks show when a message was seen.
The admin does not take part. If a student is reassigned they start a fresh conversation with the new instructor.
The old `Doubt` and `DoubtReply` tables are no longer used by the app (they were kept so no data is lost).

## Assignments

A student submits a **PDF up to 5 MB** for a course they can open (Assignments page). Only that student and the
instructor the admin assigned to them can see or download it; the admin has no access. Status flow:
**Submitted** (student sent it) -> **Verifying** (instructor pressed Start verifying) -> **Accepted** or **Rejected**.
A rejection needs a reason, which the student sees. After a rejection the student can submit again. The PDF is sent
as the raw request body (no extra upload library) and stored in the database (table `Assignment`).

## Public home page

`/` is a public landing page (hero, popular courses, how it works, benefits, pricing, FAQ). It shows only published
courses the admin switched on in **Home page courses** (admin menu, at most 8). Prices come from the active plans.

Module boundaries: `web` and `api` may import `shared`; `web` must never import `api` (enforced by ESLint via Nx tags).

## Code conventions

- **Web API calls.** Pages and components never call an API directly. Each file in `apps/web/src/services` exports plain named functions (`getCourses`, `createCourse`, ...). A page passes one to `useApi` and renames the result so several calls can live side by side:
  `const { data: courses, loading: coursesLoading, error: coursesError, callAPI: getCoursesAPI } = useApi(getCourses);`
- **API naming.** Controller functions are `list*` (many), `get*` (one), `create*`, `update*`, `delete*`, plus a verb for actions (`publishCourse`, `submitQuizAttempt`). Route files match their controller: `assignments.*` is student homework, `instructors.controller` assigns students to instructors.


## Assignment marks and certificate rules

- When an instructor accepts an assignment they enter **marks (0 to 100)**. The student sees them on the Assignments page.
- A certificate is issued only when the student scores **70% or more in both** the assignments (average marks of all course assignments) and the final quiz. A course with no assignments needs only the quiz.
- Below 70% in either one: no certificate and no "Accomplished" status. The Student and Admin certificate pages (and the verify page and PDF) show the status **Accomplished** only, never marks or percentages.
- Existing databases: run `pnpm prisma migrate dev --name assignment_marks` (adds the nullable `Assignment.marks` column). Assignments accepted before this change have no marks; to treat them as full marks run `UPDATE Assignment SET marks = 100 WHERE status = 'ACCEPTED' AND marks IS NULL;`.
- A grade is final: there is no "Edit marks" any more (the `PATCH /assignments/:id/marks` route was removed). The grading box has **Save** and **Cancel**; the marks box takes digits only.

## Assignment attempts

Assignments follow the quiz attempt rules (`libs/shared/src/assignmentAttempts.ts`, same `maxAttempts` and pass mark as the course quiz; 3 attempts and a pass mark of at least 70 by default).

- Every submission is one **attempt** and is kept: `Assignment.attemptNo`, the PDF, `marks`, `feedback` (instructor comment) and `rejectReason`. The attempt history is simply the list of submissions for that assignment.
- The instructor grades with marks. Marks **at or above the pass mark** set the status to Accepted and stop further submissions. Marks **below the pass mark**, or a plain Reject (reason required), set the status to Rejected and the student may submit again.
- A student can submit only when the previous attempt was rejected or failed, and while attempts are left. No new submission while one waits for review, after passing, or after the last attempt (`409`). The student's form shows "attempt N of M", attempts left and the passing marks.
- After every attempt is used without passing, the course shows "not eligible" for a certificate (the same as a used-up quiz).
- Existing databases: run `pnpm prisma migrate dev --name assignment_attempts` (adds `Assignment.attemptNo` and `Assignment.feedback`). To number older submissions per student and assignment, run once:
  `UPDATE Assignment a JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY studentId, courseAssignmentId ORDER BY createdAt, id) AS n FROM Assignment WHERE courseAssignmentId IS NOT NULL) x ON x.id = a.id SET a.attemptNo = x.n;`
- The student **Certificates** page opens with a progress checklist per course (lessons, quiz, assignments, with the scores so far) and a Download certificate button once accomplished (`GET /certificates/progress`). No database change is needed for this.
