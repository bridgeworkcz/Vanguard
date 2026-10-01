import jsPDF from 'jspdf';
import type { Dossier, Vacancy, User } from '../types';

export type PdfSettings = Record<string, string>;

function base(title: string) {
  const d = new jsPDF();
  d.setFillColor(10, 12, 15);
  d.rect(0, 0, 210, 31, 'F');

  d.setFillColor(255, 255, 255);
  d.circle(20, 15, 7, 'F');

  d.setTextColor(10, 12, 15);
  d.setFont('helvetica', 'bold');
  d.setFontSize(12);
  d.text('V', 17.6, 18.5);

  d.setTextColor(255, 255, 255);
  d.setFontSize(15);
  d.text('VANGUARD GLOBAL MOBILITY', 31, 14);

  d.setFontSize(8);
  d.text(title, 31, 22);

  d.setTextColor(20, 20, 20);
  return d;
}

function setting(s: PdfSettings, k: string, fallback = '') {
  return s[k] || fallback;
}

function legal(s: PdfSettings) {
  return [
    `Legal entity: ${setting(s, 'legal_entity', 'VANGUARD MOBILITY SOLUTIONS S.R.O.')}`,
    `Registration number: ${setting(s, 'registration_number', 'CZ-28941092')}`,
    `Registered address: ${setting(s, 'legal_address', 'Na Poříčí 1047/26, Nové Město, 110 00 Praha 1')}`,
    `Support: ${setting(s, 'support_email', 'ops@vanguard-mobility.com')} • ${setting(s, 'support_phone', '+420 228 886 410')}`
  ];
}

function text(d: jsPDF, items: string[], start = 43) {
  let y = start;
  d.setFont('helvetica', 'normal');
  d.setFontSize(10);

  for (const item of items) {
    const lines = d.splitTextToSize(item, 178) as string[];
    if (y + lines.length * 5 > 280) {
      d.addPage();
      y = 20;
    }
    d.text(lines, 16, y);
    y += lines.length * 5 + 4;
  }
  return y;
}

export function downloadInvoice(d: Dossier, stage: 2 | 3 | 4, settings: PdfSettings = {}) {
  const pct = stage === 2 ? 30 : stage === 3 ? 40 : 30;
  const amount = Math.round((d.totalCost * pct) * 100) / 100;
  const invoiceNumber = stage === 2 ? '№1 (30%)' : stage === 3 ? '№2 (40%)' : '№3 (30%)';

  const doc = base(`OFFICIAL PAYMENT INVOICE ${invoiceNumber}`);

  const deadlineNotice =
    stage === 2
      ? 'УВАГА: Термін оплати становить 5 ДНІВ з моменту схвалення заявки (Статус 2). У разі відсутності підтвердження оплати заявка автоматично анулюється. / NOTICE: 5 days allowed to submit receipt before automatic application cancellation.'
      : stage === 3
      ? 'УВАГА: На оплату другого етапу надається 14 ДНІВ з моменту ухвалення подачі документів роботодавцем до міністерства. / NOTICE: Exactly 14 days provided for payment from employer ministry approval.'
      : 'УВАГА: Клієнт зобовʼязаний оплатити цей фінальний інвойс до моменту закінчення терміну дії візи. Етап передбачає міжнародну курʼєрську відправку DHL або надання облікових даних для авторизації на держпорталах. / NOTICE: Must be paid before visa validity deadline. Covers worldwide DHL delivery and governmental portal authorization.';

  text(doc, [
    ...legal(settings),
    `Invoice date: ${new Date().toLocaleDateString()}`,
    `Dossier ID: ${d.id}`,
    `Client: ${d.fullName}`,
    `Destination country: ${d.targetCountry}`,
    `Total contract price: ${d.totalCost.toFixed(2)} ${d.currency}`,
    `Current stage milestone: Stage ${stage} (${pct}%)`,
    `AMOUNT DUE NOW: ${amount.toFixed(2)} ${d.currency}`,
    `Payment method: ${setting(settings, 'payment_method', 'USDT / TRC-20')}`,
    `Verified deposit wallet: ${setting(settings, 'crypto_wallet', 'TY13xN9K8qWpmgBvLkF79xZaVqmZ7ZfP1x')}`,
    deadlineNotice,
    'Tranche milestone model: 30% (Initial preparation) + 40% (Ministry filing clearance) + 30% (Final delivery & dispatch).',
    'Terms: Official digital confirmation and upload of transfer screenshot/receipt is required in the client cabinet for accounting verification.',
    `Support contact: ${setting(settings, 'support_email', 'ops@vanguard-mobility.com')}`
  ]);

  doc.save(`${d.id}-INVOICE-${stage}.pdf`);
}

export function downloadContract(d: Dossier, user: User, settings: PdfSettings = {}) {
  const doc = base('OFFICIAL SERVICE AGREEMENT');

  text(doc, [
    ...legal(settings),
    `Agreement date: ${new Date().toLocaleDateString()}`,
    `Client: ${user.fullName}`,
    `Client email: ${user.email}`,
    `Client phone: ${user.phone}`,
    `Dossier: ${d.id}`,
    `Destination: ${d.targetCountry}`,
    `Service amount: ${d.totalCost.toFixed(2)} ${d.currency}`,
    '1. Scope. Vanguard provides mobility coordination, dossier formation and employer liaison as requested.',
    '2. Client obligations. The client undertakes to provide authentic documentation, scans, police clearances and adhere to deadlines.',
    '3. Milestone payments. 30% upon approval, 40% upon employer ministry approval (14-day window), 30% prior to dispatch.',
    '4. Document delivery. Final watermarked scans are provided digitally; unwatermarked originals dispatched via worldwide courier (DHL) upon final stage completion.',
    'SIGNATURES:',
    'Client: _______________________',
    'Authorized representative: _______________________'
  ]);

  doc.save(`${d.id}-service-agreement.pdf`);
}

export function downloadJobOffer(user: User, d: Dossier, v?: Vacancy, settings: PdfSettings = {}) {
  const doc = base('JOB OFFER TEMPLATE & VACANCY SPECIFICATION');

  text(doc, [
    ...legal(settings),
    `Date: ${new Date().toLocaleDateString()}`,
    `Candidate: ${user.fullName}`,
    `Dossier: ${d.id}`,
    `Position: ${v?.title || d.vacancyTitle || 'To be confirmed'}`,
    `Country: ${v?.country || d.targetCountry}`,
    `Salary Net: ${v?.salaryNet || 'To be confirmed'}`,
    `Accommodation: ${v?.accommodation || 'According to offer'}`,
    `Working hours: ${v?.workingHours || '40 hours per week'}`,
    'Official employer verification will be affixed during the employer submission stage.'
  ]);

  doc.save(`${d.id}-job-offer.pdf`);
}

export function downloadWatermarkedPreview(fileName: string, clientName: string, dossierId: string) {
  const doc = new jsPDF();
  doc.setFillColor(15, 17, 21);
  doc.rect(0, 0, 210, 297, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('VANGUARD OFFICIAL VERIFICATION VAULT', 20, 25);

  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.text(`Document: ${fileName}`, 20, 36);
  doc.text(`Dossier ID: ${dossierId} • Candidate: ${clientName}`, 20, 44);
  doc.text(`Status: STAGE 3 FINAL LEGAL SERVICE (WATERMARKED COPY)`, 20, 52);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');

  doc.text('*** WATERMARKED PREVIEW ***', 22, 130, { angle: 35 });
  doc.text('NOT FOR TRAVEL / ЗРАЗОК', 35, 160, { angle: 35 });
  doc.text(`VERIFIED: ${dossierId}`, 55, 190, { angle: 35 });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 160, 160);
  doc.text('This document contains an anti-tamper verification watermark issued during Stage 3.', 20, 250);
  doc.text('Official clean originals are dispatched via DHL express upon Stage 4 completion (30%).', 20, 258);

  doc.save(`${dossierId}-${fileName}-WATERMARKED.pdf`);
}
