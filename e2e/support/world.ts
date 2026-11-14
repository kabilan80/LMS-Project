import { ADMIN, STRONG_PASSWORD } from './env';
import { login, must } from './api';

let counter = 0;
/** Unique suffix so every spec (and every run) can create users without clashing. */
export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface Person {
  id: number;
  name: string;
  email: string;
  password: string;
  token: string;
}

export async function adminSession(): Promise<Person> {
  const r = await login(ADMIN.email, ADMIN.password);
  return { id: r.user.id, name: r.user.name, email: ADMIN.email, password: ADMIN.password, token: r.token };
}

/** Admin creates an instructor; the instructor then replaces the temporary password (as in real life). */
export async function makeInstructor(admin: Person, label = 'Instructor'): Promise<Person> {
  const tag = uid('ins');
  const name = `${label} ${tag}`;
  const email = `${tag}@example.com`;
  const created = await must<{ user: { id: number }; temporaryPassword: string }>('POST', '/users', admin.token, {
    role: 'INSTRUCTOR', name, email, expertise: 'Testing',
  });
  const first = await login(email, created.temporaryPassword);
  await must('POST', '/auth/change-password', first.token, { currentPassword: created.temporaryPassword, newPassword: STRONG_PASSWORD });
  const again = await login(email, STRONG_PASSWORD);
  return { id: created.user.id, name, email, password: STRONG_PASSWORD, token: again.token };
}

export async function makeStudent(label = 'Student'): Promise<Person> {
  const tag = uid('stu');
  const name = `${label} ${tag}`;
  const email = `${tag}@example.com`;
  const r = await must<{ token: string; user: { id: number } }>('POST', '/auth/register', null, {
    name, email, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD, acceptTerms: true,
  });
  return { id: r.user.id, name, email, password: STRONG_PASSWORD, token: r.token };
}

export const assign = (admin: Person, student: Person, instructor: Person | null) =>
  must('PATCH', `/students/${student.id}/instructor`, admin.token, { instructorId: instructor?.id ?? null });

export interface CourseInfo {
  id: number;
  title: string;
  lessonIds: number[];
}

/** A published course: 2 lessons (60 s each) and a one-question quiz ("Right" is correct). */
export async function makePublishedCourse(admin: Person, instructor: Person, label = 'Course'): Promise<CourseInfo> {
  const title = `${label} ${uid('c')}`;
  const { id } = await must<{ id: number }>('POST', '/courses', instructor.token, {
    title, description: 'A course made by the browser tests.', category: 'Testing', level: 'BEGINNER', passMark: 70, maxAttempts: 3,
  });
  const mod = await must<{ id: number }>('POST', `/courses/${id}/modules`, instructor.token, { title: 'Module one' });
  const lessonIds: number[] = [];
  for (const n of [1, 2]) {
    const l = await must<{ id: number }>('POST', `/modules/${mod.id}/lessons`, instructor.token, {
      title: `Lesson ${n}`, youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', durationSeconds: 60, isPreview: n === 1,
    });
    lessonIds.push(l.id);
  }
  await must('PUT', `/courses/${id}/quiz`, instructor.token, {
    title: 'Final quiz', timeLimitMinutes: 10,
    questions: [{ text: 'Pick the right one', options: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }] }],
  });
  await must('POST', `/courses/${id}/submit`, instructor.token);
  await must('POST', `/courses/${id}/approve`, admin.token);
  return { id, title, lessonIds };
}

export const grantFree = (by: Person, student: Person, course: CourseInfo) =>
  must('POST', '/grants', by.token, { studentId: student.id, courseId: course.id });

/** Finishes every lesson of a course the student can open (the video player is not needed for this). */
export async function completeLessons(student: Person, course: CourseInfo) {
  for (const lessonId of course.lessonIds) {
    await must('PUT', `/lessons/${lessonId}/progress`, student.token, { positionSeconds: 60, watchedSeconds: 60, durationSeconds: 60, ended: true });
  }
}
