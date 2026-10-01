import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Application, ProcessingOption } from '../src/types.js';
import { visaProducts, priceFor } from '../src/config/catalog.js';
import { mapApplicationToRow, mapVacancyToRow } from '../server/utils/mappers.js';
import { appendSheetRow } from '../server/utils/sheets.js';
import { authenticateRequest } from '../server/utils/permissions.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';
import { sendSafeTelegramAlert, escapeTelegramHtml } from '../server/utils/telegram.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = authenticateRequest(req.headers.authorization);
    if (!auth.authorized || !auth.session) return res.status(auth.statusCode).json({ error: auth.errorMessage });

    const product = visaProducts.find(x => x.id === String(req.body?.visaProductId || '').trim());
    if (!product) return res.status(400).json({ error: 'Select a visa product.' });
    const processing = String(req.body?.processingOption || 'STANDARD') as ProcessingOption;
    if (!product.allowedProcessing.includes(processing)) return res.status(400).json({ error: 'This processing speed is not available for the selected country.' });
    const citizenship = String(req.body?.citizenship || '').trim();
    if (!citizenship) return res.status(400).json({ error: 'Citizenship is required.' });

    const now = new Date().toISOString();
    const vacancyId = `CALC-${product.id}-${crypto.randomInt(100000, 999999)}`;
    await appendSheetRow('Vacancies', mapVacancyToRow({
      id: vacancyId,
      title: `${product.name}, ${product.duration}`,
      category: product.name,
      country: product.country,
      salaryNet: 'Confirmed after employer match',
      salaryGross: 'Stated in the employer offer',
      accommodation: 'Confirmed in the offer',
      workingHours: 'Confirmed in the offer',
      description: `${product.name} for ${product.country}. Started from the client calculator.`,
      quotaRemaining: 20,
      isActive: true,
      visaProductId: product.id,
      visaDuration: product.duration,
      processingOptions: product.allowedProcessing,
      employerLabel: 'Assigned after review',
      requirements: 'Passport, police clearance, medical set, questionnaire.',
      createdAt: now,
      updatedAt: now
    }));

    const app: Application = {
      id: `APP-${new Date().getUTCFullYear()}-${crypto.randomInt(100000, 1000000)}`,
      userId: auth.session.userId,
      vacancyId,
      applicantData: JSON.stringify({ citizenship, source: 'client-calculator' }),
      status: 'SUBMITTED',
      stage: 1,
      visaProductId: product.id,
      country: product.country,
      processingOption: processing,
      totalCost: priceFor(product, processing),
      currency: 'EUR',
      createdAt: now,
      updatedAt: now
    };
    await appendSheetRow('Applications', mapApplicationToRow(app));
    await recordSafeAuditLog({ actorUserId: auth.session.userId, action: 'APPLICATION_CREATE', targetEntity: 'APPLICATION', targetEntityId: app.id, details: `${product.country} / ${product.duration} / ${processing}` });
    await sendSafeTelegramAlert(`<b>New calculator application</b> <code>${app.id}</code>\n${escapeTelegramHtml(product.country)}`);
    return res.status(201).json({ application: app });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal Server Error' });
  }
}
