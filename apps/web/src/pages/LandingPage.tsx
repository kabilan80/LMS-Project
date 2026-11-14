import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_HOME, formatMoney, type HomeCourse } from '@lms/shared';
import { Brand } from '../components/Icon';
import useApi from '../hooks/useApi';
import { getHomePage } from '../services/homeService';
import { useAuthStore } from '../store/authStore';

const LEVEL = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' } as const;

const STEPS = [
  { n: '1', title: 'Create your account', text: 'Sign up in a minute. Browse the courses and pick what you want to learn.' },
  { n: '2', title: 'Learn with videos', text: 'Watch lessons one by one. Your place is saved, and you can ask your instructor any doubt.' },
  { n: '3', title: 'Pass and get certified', text: 'Take the final quiz, submit assignments, and download a certificate anyone can verify.' },
];

const BENEFITS = [
  { icon: '▶', title: 'Video lessons', text: 'Short lessons in a clear order, with progress saved automatically.' },
  { icon: '✔', title: 'Quizzes and certificates', text: 'Pass the course quiz and get a certificate with a code employers can check.' },
  { icon: '?', title: 'Ask your instructor', text: 'Every student has an assigned instructor to answer doubts.' },
  { icon: '✎', title: 'Assignment feedback', text: 'Submit a PDF and get it accepted, or rejected with a clear reason.' },
];

const FAQ = [
  { q: 'Do I need to pay to start?', a: 'You can create an account for free and browse every course. Some lessons are free previews. To open a course you buy it, take a bundle, or subscribe for the year.' },
  { q: 'How do I get my certificate?', a: 'Finish all lessons, then pass the final quiz. Your certificate is ready to download straight away and has a code anyone can verify.' },
  { q: 'Who answers my questions?', a: 'The admin assigns every student an instructor. Use the Doubts page to message them.' },
  { q: 'What can I submit as an assignment?', a: 'A PDF file up to 5 MB. Your instructor checks it and either accepts it or rejects it with a reason so you can fix it.' },
];

function CourseCard({ c, cta }: { c: HomeCourse; cta: string }) {
  return (
    <article className="card flex flex-col gap-2 p-0">
      {c.thumbnailUrl ? (
        <img src={c.thumbnailUrl} alt="" className="h-36 w-full rounded-t-card object-cover" loading="lazy" />
      ) : (
        <div className="grid h-36 place-items-center rounded-t-card bg-navy font-heading text-[40px] font-bold text-gold" aria-hidden="true">{c.title.charAt(0).toUpperCase()}</div>
      )}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5">
        <div className="flex flex-wrap gap-1.5">
          <span className="pill pill-info">{c.category}</span>
          <span className="pill pill-wait">{LEVEL[c.level]}</span>
        </div>
        <h3 className="font-heading text-[16px] font-bold leading-snug">{c.title}</h3>
        <p className="text-[13px] text-muted">{c.description}</p>
        <div className="mt-auto flex items-center justify-between text-[12px] text-muted">
          <span>{c.lessonCount} lesson{c.lessonCount === 1 ? '' : 's'}</span>
          <span>By {c.teacherName}</span>
        </div>
        <Link to={cta} className="btn btn-primary justify-center">{cta === '/register' ? 'Start learning' : 'Open my dashboard'}</Link>
      </div>
    </article>
  );
}

/** Public home page: anyone can open it without signing in. The admin chooses which courses show here. */
export function LandingPage() {
  const user = useAuthStore((s) => s.user);
  const { data: homePage, loaded: homePageLoaded, callAPI: getHomePageAPI } = useApi(getHomePage);
  useEffect(() => { getHomePageAPI().catch(() => undefined); }, [getHomePageAPI]);
  const dashboard = user ? (user.mustChangePassword ? '/change-password' : ROLE_HOME[user.role]) : null;
  const link = 'rounded-ctl px-2.5 py-1.5 text-[14px] font-semibold text-ink hover:bg-page';

  return (
    <div id="top" className="min-h-screen bg-page text-[14px]">
      <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link to="/" aria-label="LearnHub home"><Brand className="!text-navy" /></Link>
          <nav aria-label="Page sections" className="ml-4 hidden items-center gap-1 md:flex">
            <a href="#courses" className={link}>Courses</a>
            <a href="#how" className={link}>How it works</a>
            <a href="#pricing" className={link}>Pricing</a>
            <a href="#faq" className={link}>FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {dashboard ? (
              <Link to={dashboard} className="btn btn-primary">Go to my dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn">Sign in</Link>
                <Link to="/register" className="btn btn-gold">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div className="flex flex-col justify-center gap-4">
            <h1 className="font-heading text-[34px] font-bold leading-[1.1] md:text-[46px]">Learn at your pace.<br /><span className="text-gold">Earn your certificate.</span></h1>
            <p className="max-w-xl text-[16px] text-side-text">Video courses, quizzes, assignments and a personal instructor, all in one place. Start free and learn when it suits you.</p>
            <div className="flex flex-wrap gap-2.5">
              <a href="#courses" className="btn btn-gold btn-lg">Browse courses</a>
              {!dashboard && <Link to="/register" className="btn btn-lg border-white/30 bg-transparent text-white">Create free account</Link>}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 self-center" aria-label="LearnHub in numbers">
            {[
              ['Courses', homePage?.stats.courses],
              ['Learners', homePage?.stats.students],
              ['Certificates', homePage?.stats.certificates],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex flex-col-reverse rounded-card border border-white/15 bg-navy-2 p-3 text-center">
                <dt className="text-[12px] text-side-text">{label}</dt>
                <dd className="font-heading text-[28px] font-bold text-gold">{value ?? '–'}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="courses" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-12">
        <h2 className="font-heading text-[26px] font-bold">Popular courses</h2>
        <p className="mb-5 text-muted">A few of our courses to get you started.</p>
        {!homePageLoaded ? <p className="text-muted" role="status">Loading courses…</p> :
          !homePage || homePage.courses.length === 0 ? <div className="card py-10 text-center text-muted">New courses are coming soon.</div> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{homePage.courses.map((c) => <CourseCard key={c.id} c={c} cta={dashboard ?? '/register'} />)}</div>
        )}
      </section>

      <section id="how" className="scroll-mt-16 bg-card py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-heading text-[26px] font-bold">How it works</h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card flex gap-3">
                <i className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gold font-heading font-bold not-italic text-gold-ink">{s.n}</i>
                <div><b className="block text-[15px]">{s.title}</b><p className="text-muted">{s.text}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-heading text-[26px] font-bold">Why learn with LearnHub</h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <li key={b.title} className="card">
              <i className="mb-2 grid h-9 w-9 place-items-center rounded-ctl bg-navy font-bold not-italic text-gold" aria-hidden="true">{b.icon}</i>
              <b className="block text-[15px]">{b.title}</b>
              <p className="text-muted">{b.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {homePage && homePage.plans.length > 0 && (
        <section id="pricing" className="scroll-mt-16 bg-card py-12">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-heading text-[26px] font-bold">Simple pricing</h2>
            <p className="mb-5 text-muted">One fixed price. No hidden fees.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {homePage.plans.map((p) => (
                <div key={p.id} className={`card flex flex-col gap-2 ${p.type === 'ANNUAL' ? 'border-2 border-gold' : ''}`}>
                  {p.type === 'ANNUAL' && <span className="pill pill-wait w-fit">Best value</span>}
                  <h3 className="font-heading text-[18px] font-bold">{p.name}</h3>
                  <div className="font-heading text-[30px] font-bold">{formatMoney(p.priceMinor, p.currency)}</div>
                  <p className="text-muted">{p.type === 'ANNUAL' ? 'Every course for 12 months, new courses included.' : 'One course of your choice, yours for life.'}</p>
                  <Link to={dashboard ?? '/register'} className={`btn mt-auto justify-center ${p.type === 'ANNUAL' ? 'btn-gold' : 'btn-primary'}`}>{dashboard ? 'Go to my dashboard' : 'Get started'}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-12">
        <h2 className="mb-4 font-heading text-[26px] font-bold">Questions</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card group">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
              <p className="mt-2 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {!dashboard && (
        <section className="bg-navy py-12 text-center text-white">
          <h2 className="font-heading text-[26px] font-bold">Ready to start learning?</h2>
          <p className="mx-auto mb-5 mt-1 max-w-md text-side-text">Create your free account and open your first lesson today.</p>
          <Link to="/register" className="btn btn-gold btn-lg">Create free account</Link>
        </section>
      )}

      <footer className="bg-navy text-side-text">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Brand />
            <p className="max-w-xs text-[13px] leading-relaxed">Video courses, quizzes, assignments and certificates anyone can verify. Learn at your own pace with an instructor by your side.</p>
          </div>
          <nav aria-label="Explore">
            <h2 className="mb-3 font-heading text-[13px] font-bold uppercase tracking-wide text-white">Explore</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              <li><a href="#courses" className="hover:text-white">Courses</a></li>
              <li><a href="#how" className="hover:text-white">How it works</a></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
              <li><a href="#faq" className="hover:text-white">FAQ</a></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <h2 className="mb-3 font-heading text-[13px] font-bold uppercase tracking-wide text-white">Account</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              {dashboard ? (
                <li><Link to={dashboard} className="hover:text-white">My dashboard</Link></li>
              ) : (
                <>
                  <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
                  <li><Link to="/register" className="hover:text-white">Create account</Link></li>
                </>
              )}
            </ul>
          </nav>
          <div>
            <h2 className="mb-3 font-heading text-[13px] font-bold uppercase tracking-wide text-white">Learn with us</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              <li>Learn on any device</li>
              <li>Verified certificates</li>
              <li>Instructor support</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12px]">
            <span>© {new Date().getFullYear()} LearnHub. All rights reserved.</span>
            <a href="#top" className="hover:text-white">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
