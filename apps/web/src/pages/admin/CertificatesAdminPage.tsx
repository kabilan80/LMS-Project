import { useEffect, useState, type FormEvent } from 'react';
import { certificateTemplateSchema, type AdminCertificateRow, type CertificateTemplate } from '@lms/shared';
import { Field, FormError } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useDebounced';
import { downloadCertificate, getAdminCertificates, getCertificateTemplate, saveCertificateTemplate } from '../../services/learningService';
import { formatDate } from '../../utils/format';

/** Same layout as the PDF, so the admin sees what students will get. */
function Preview({ t }: { t: CertificateTemplate }) {
  return (
    <div className="rounded-card border-[6px] bg-white p-1.5" style={{ borderColor: t.primaryColor }} aria-label="Certificate preview">
      <div className="rounded-ctl border px-4 py-6 text-center" style={{ borderColor: t.accentColor }}>
        <div className="text-[10px] font-bold tracking-[0.3em]" style={{ color: t.accentColor }}>{t.orgName}</div>
        <div className="font-heading text-[20px] font-bold" style={{ color: t.primaryColor }}>{t.title}</div>
        <div className="mt-2 text-muted">{t.introText}</div>
        <div className="font-heading text-[20px] font-bold">Student Name</div>
        <div className="mt-1 text-muted">{t.courseText}</div>
        <div className="font-heading text-[16px] font-bold" style={{ color: t.primaryColor }}>Course title</div>
        <div className="mt-1 font-semibold">Accomplished</div>
        <div className="mt-4 flex items-end justify-between gap-2 text-[11px] text-muted">
          <span>Date issued</span>
          {t.signerName && <span className="text-center"><b className="block text-ink">{t.signerName}</b>{t.signerTitle}</span>}
          <span className="font-mono">Certificate ID</span>
        </div>
        {t.footerNote && <div className="mt-3 text-[11px] text-muted">{t.footerNote}</div>}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | undefined }) {
  return (
    <div className="mb-[9px]">
      <label htmlFor={`c-${label}`} className="mb-[3px] block text-xs font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded-ctl border border-line bg-card p-0.5" />
        <input id={`c-${label}`} className="input" value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </div>
      {error && <p className="mt-1 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

function TemplateEditor() {
  const { data: certificateTemplateData, loaded: certificateTemplateLoaded, error: certificateTemplateError, callAPI: getCertificateTemplateAPI } = useApi(getCertificateTemplate);
  const refetch = () => getCertificateTemplateAPI().then(() => undefined, () => undefined);
  useEffect(() => { void refetch(); }, []);
  const [t, setT] = useState<CertificateTemplate | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const { loading: saveLoading, error: saveError, callAPI: saveCertificateTemplateAPI, reset: resetSave } = useApi(saveCertificateTemplate);
  const busy = saveLoading;
  const err = localErr ?? saveError;
  useEffect(() => { if (certificateTemplateData) setT(certificateTemplateData); }, [certificateTemplateData]);

  if (!certificateTemplateLoaded && !certificateTemplateError) return <LoadingBlock />;
  if (certificateTemplateError && !certificateTemplateData) return <ErrorBlock message={certificateTemplateError} onRetry={refetch} />;
  if (!t) return null;
  const set = <K extends keyof CertificateTemplate>(k: K, v: CertificateTemplate[K]) => { setSaved(false); setT({ ...t, [k]: v }); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!t) return;
    setLocalErr(null);
    resetSave();
    setSaved(false);
    const parsed = certificateTemplateSchema.safeParse(t);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setFieldErrors(errs);
    }
    setFieldErrors({});
    try {
      setT(await saveCertificateTemplateAPI(parsed.data));
      setSaved(true);
    } catch {
      /* save.error is shown in the form */
    }
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(320px,400px)_1fr]">
      <form onSubmit={submit} noValidate className="card" aria-label="Certificate template">
        <h3 className="mb-2 font-heading text-[14px] font-bold">Certificate template</h3>
        <FormError message={err} />
        {saved && <p className="mb-3 rounded-ctl bg-pill-ok-bg px-3 py-2 text-pill-ok" role="status">Saved. New and existing certificates use this design.</p>}
        <Field label="Organisation name" value={t.orgName} onChange={(e) => set('orgName', e.target.value)} error={fieldErrors['orgName']} maxLength={80} />
        <Field label="Title" value={t.title} onChange={(e) => set('title', e.target.value)} error={fieldErrors['title']} maxLength={80} />
        <Field label="Line above the student name" value={t.introText} onChange={(e) => set('introText', e.target.value)} error={fieldErrors['introText']} maxLength={120} />
        <Field label="Line above the course title" value={t.courseText} onChange={(e) => set('courseText', e.target.value)} error={fieldErrors['courseText']} maxLength={120} />
        <Field label="Signed by (optional)" value={t.signerName} onChange={(e) => set('signerName', e.target.value)} maxLength={80} />
        <Field label="Signer title (optional)" value={t.signerTitle} onChange={(e) => set('signerTitle', e.target.value)} maxLength={80} />
        <Field label="Footer note (optional)" value={t.footerNote} onChange={(e) => set('footerNote', e.target.value)} maxLength={160} />
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Main color" value={t.primaryColor} onChange={(v) => set('primaryColor', v)} error={fieldErrors['primaryColor']} />
          <ColorField label="Accent color" value={t.accentColor} onChange={(v) => set('accentColor', v)} error={fieldErrors['accentColor']} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button>
          <button type="button" className="btn" onClick={() => { setT(certificateTemplateData); setFieldErrors({}); setLocalErr(null); resetSave(); setSaved(false); }}>Reset changes</button>
        </div>
      </form>
      <div className="flex flex-col gap-2">
        <h3 className="font-heading text-[14px] font-bold">Preview</h3>
        <Preview t={t} />
        <p className="text-muted">The PDF follows the same wording and colors. Names use the student's own name and course.</p>
      </div>
    </div>
  );
}

function IssuedList() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [page, setPage] = useState(1);
  const { error: downloadError, callAPI: downloadCertificateAPI } = useApi(downloadCertificate);
  const { data: adminCertificatesData, loaded: adminCertificatesLoaded, error: adminCertificatesError, callAPI: getAdminCertificatesAPI } = useApi(getAdminCertificates);
  const refetch = () => getAdminCertificatesAPI({ page, pageSize: 10, search: debounced || undefined }).then(() => undefined, () => undefined);
  useEffect(() => { void refetch(); }, [page, debounced]);

  const download = (c: AdminCertificateRow) => void downloadCertificateAPI(c).catch(() => undefined);

  return (
    <section aria-label="Issued certificates" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-heading text-[14px] font-bold">Issued certificates</h3>
        <input className="input max-w-[260px]" placeholder="Search student, course or ID" aria-label="Search certificates" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      {downloadError && <ErrorBlock message={downloadError} />}
      {!adminCertificatesLoaded && !adminCertificatesError ? <LoadingBlock /> : adminCertificatesError ? <ErrorBlock message={adminCertificatesError} onRetry={refetch} /> :
        !adminCertificatesData || adminCertificatesData.items.length === 0 ? <EmptyState title="No certificates found" message="Certificates appear here when students score 70% or more in both assignments and the final quiz." /> : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left">
              <thead><tr className="border-b border-line text-muted">
                <th className="px-3.5 py-2.5 font-semibold">Student</th><th className="px-3.5 py-2.5 font-semibold">Course</th><th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 font-semibold">Issued</th><th className="px-3.5 py-2.5 font-semibold">ID</th><th className="px-3.5 py-2.5" />
              </tr></thead>
              <tbody>
                {adminCertificatesData.items.map((c) => (
                  <tr key={c.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3.5 py-2.5"><b className="block">{c.studentName}</b><span className="text-muted">{c.studentEmail}</span></td>
                    <td className="px-3.5 py-2.5">{c.courseTitle}</td>
                    <td className="px-3.5 py-2.5"><span className="pill pill-ok">{c.status}</span></td>
                    <td className="px-3.5 py-2.5 text-muted">{formatDate(c.issuedAt)}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted">{c.code}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                      <button className="btn mr-1.5" onClick={() => download(c)}>Download PDF</button>
                      <a className="btn" href={`/verify/${c.code}`} target="_blank" rel="noreferrer noopener">Verify</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={adminCertificatesData.page} pageSize={adminCertificatesData.pageSize} total={adminCertificatesData.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}

export function CertificatesAdminPage() {
  return (
    <>
      <TemplateEditor />
      <IssuedList />
    </>
  );
}
