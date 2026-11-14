import type { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';
import {
  CERTIFICATE_STATUS,
  DEFAULT_CERTIFICATE_TEMPLATE,
  Role,
  listCertificatesQuery,
  type AdminCertificateRow,
  type CertificateRow,
  type CertificateTemplate,
  type CertificateTemplateInput,
  type Paginated,
  type VerifyResponse,
} from '@lms/shared';
import { audit } from '../lib/audit';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { notFound } from '../middleware/errors';
import { getCertificateProgress } from '../services/certificates';
import { parseId } from './helpers';

const certSelect = {
  id: true,
  code: true,
  courseId: true,
  issuedAt: true,
  course: { select: { title: true } },
  student: { select: { name: true, email: true } },
} as const;

export async function listCertificates(req: Request, res: Response) {
  const rows = await prisma.certificate.findMany({
    where: { studentId: req.auth!.id },
    orderBy: { issuedAt: 'desc' },
    select: certSelect,
  });
  const items: CertificateRow[] = rows.map((c) => ({
    id: c.id,
    code: c.code,
    courseId: c.courseId,
    courseTitle: c.course.title,
    studentName: c.student.name,
    status: CERTIFICATE_STATUS,
    issuedAt: c.issuedAt.toISOString(),
  }));
  res.json({ items });
}

/** Student: the checklist toward each course's certificate (lessons, quiz, assignments). */
export async function listCertificateProgress(req: Request, res: Response) {
  res.json({ items: await getCertificateProgress(req.auth!.id) });
}

// ---- Template (admin) ----

const TEMPLATE_ID = 1;
const templateFields = (t: CertificateTemplate) => ({
  orgName: t.orgName, title: t.title, introText: t.introText, courseText: t.courseText, signerName: t.signerName,
  signerTitle: t.signerTitle, footerNote: t.footerNote, primaryColor: t.primaryColor, accentColor: t.accentColor, showScore: t.showScore,
});

/** The saved template, or the built-in default until the admin saves one. */
export async function loadTemplate(): Promise<CertificateTemplate> {
  const row = await prisma.certificateTemplate.findUnique({ where: { id: TEMPLATE_ID } });
  return row ? templateFields(row) : { ...DEFAULT_CERTIFICATE_TEMPLATE };
}

export async function getCertificateTemplate(_req: Request, res: Response) {
  res.json(await loadTemplate());
}

export async function updateCertificateTemplate(req: Request, res: Response) {
  const input = req.body as CertificateTemplateInput;
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.certificateTemplate.upsert({ where: { id: TEMPLATE_ID }, update: input, create: { id: TEMPLATE_ID, ...input } });
    await audit(req.auth!.id, 'certificate.template', 'CertificateTemplate', TEMPLATE_ID, tx);
    return row;
  });
  res.json(templateFields(saved));
}

/** Every certificate ever issued, newest first, with an optional student / course / code search. */
export async function listAdminCertificates(req: Request, res: Response) {
  const q = listCertificatesQuery.parse(req.query);
  const where: Prisma.CertificateWhereInput = q.search
    ? { OR: [{ code: { contains: q.search } }, { student: { name: { contains: q.search } } }, { student: { email: { contains: q.search } } }, { course: { title: { contains: q.search } } }] }
    : {};
  const [total, rows] = await Promise.all([
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({ where, select: certSelect, orderBy: { issuedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  const body: Paginated<AdminCertificateRow> = {
    items: rows.map((c) => ({
      id: c.id, code: c.code, courseId: c.courseId, courseTitle: c.course.title, studentName: c.student.name,
      studentEmail: c.student.email, status: CERTIFICATE_STATUS, issuedAt: c.issuedAt.toISOString(),
    })),
    page: q.page, pageSize: q.pageSize, total,
  };
  res.json(body);
}

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The owner (or the admin) can download the PDF. Someone else's certificate looks like a missing one. */
export async function downloadCertificatePdf(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const cert = await prisma.certificate.findUnique({ where: { id }, select: { ...certSelect, studentId: true } });
  if (!cert || (req.auth!.role !== Role.ADMIN && cert.studentId !== req.auth!.id)) throw notFound('Certificate not found');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.code}.pdf"`);

  // Landscape A4 (842 x 595 pt). Built-in Helvetica: names with non-Latin letters need an embedded font (later).
  const t = await loadTemplate();
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificate ${cert.code}` } });
  doc.pipe(res);
  const W = doc.page.width;
  const H = doc.page.height;

  doc.rect(0, 0, W, H).fill('#FFFFFF');
  doc.lineWidth(8).strokeColor(t.primaryColor).rect(22, 22, W - 44, H - 44).stroke();
  doc.lineWidth(1.5).strokeColor(t.accentColor).rect(36, 36, W - 72, H - 72).stroke();

  doc.fillColor(t.accentColor).font('Helvetica-Bold').fontSize(12).text(t.orgName, 0, 78, { align: 'center', width: W, characterSpacing: 4 });
  doc.fillColor(t.primaryColor).font('Helvetica-Bold').fontSize(36).text(t.title, 40, 108, { align: 'center', width: W - 80 });
  doc.fillColor('#6A7388').font('Helvetica').fontSize(14).text(t.introText, 0, 175, { align: 'center', width: W });
  doc.fillColor('#1B2233').font('Helvetica-Bold').fontSize(32).text(cert.student.name, 60, 205, { align: 'center', width: W - 120 });
  doc.fillColor('#6A7388').font('Helvetica').fontSize(14).text(t.courseText, 0, 260, { align: 'center', width: W });
  doc.fillColor(t.primaryColor).font('Helvetica-Bold').fontSize(24).text(cert.course.title, 80, 290, { align: 'center', width: W - 160 });
  // Certificates carry no marks, percentages or grades. A certificate exists only for students who earned 70%+ in assignments and quiz.
  doc.fillColor('#1B2233').font('Helvetica-Bold').fontSize(16).text(CERTIFICATE_STATUS, 0, 345, { align: 'center', width: W });

  doc.moveTo(120, 440).lineTo(300, 440).lineWidth(1).strokeColor('#E2E6EF').stroke();
  doc.fillColor('#1B2233').font('Helvetica-Bold').fontSize(13).text(longDate.format(cert.issuedAt), 120, 448, { width: 180, align: 'center' });
  doc.fillColor('#6A7388').font('Helvetica').fontSize(10).text('Date issued', 120, 466, { width: 180, align: 'center' });

  if (t.signerName) {
    doc.moveTo(W / 2 - 90, 440).lineTo(W / 2 + 90, 440).lineWidth(1).strokeColor('#E2E6EF').stroke();
    doc.fillColor('#1B2233').font('Helvetica-Bold').fontSize(13).text(t.signerName, W / 2 - 100, 448, { width: 200, align: 'center' });
    if (t.signerTitle) doc.fillColor('#6A7388').font('Helvetica').fontSize(10).text(t.signerTitle, W / 2 - 100, 466, { width: 200, align: 'center' });
  }

  doc.fillColor('#1B2233').font('Helvetica-Bold').fontSize(13).text(cert.code, W - 340, 448, { width: 220, align: 'center' });
  doc.fillColor('#6A7388').font('Helvetica').fontSize(10).text('Certificate ID', W - 340, 466, { width: 220, align: 'center' });

  if (t.footerNote) doc.fillColor('#6A7388').font('Helvetica').fontSize(10).text(t.footerNote, 60, H - 94, { align: 'center', width: W - 120 });
  doc.fillColor('#6A7388').font('Helvetica').fontSize(10).text(`Verify at ${env.CLIENT_URL}/verify/${cert.code}`, 0, H - 76, { align: 'center', width: W });
  doc.end();
}

/** Public: anyone can check a certificate code. Unknown codes return valid:false (never an error page). */
export async function verifyCertificate(req: Request, res: Response) {
  const code = String(req.params['code'] ?? '').trim().toUpperCase().slice(0, 40);
  const cert = code ? await prisma.certificate.findUnique({ where: { code }, select: certSelect }) : null;
  const body: VerifyResponse = cert
    ? {
        valid: true,
        code: cert.code,
        studentName: cert.student.name,
        courseTitle: cert.course.title,
        status: CERTIFICATE_STATUS,
        issuedAt: cert.issuedAt.toISOString(),
      }
    : { valid: false };
  res.json(body);
}
