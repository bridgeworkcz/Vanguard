import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Vacancy } from '../src/types';
import { mapRowToVacancy, mapVacancyToRow } from '../server/utils/mappers';
import {
  readSheetRows,
  findSheetRowById,
  appendSheetRow
} from '../server/utils/sheets';
import { authenticateRequest, isStaff } from '../server/utils/permissions';
import { recordSafeAuditLog } from '../server/utils/audit';

const VACANCIES_SHEET_NAME = 'Vacancies';

// --- 1. Обробник отримання вакансій (GET Handler) ---

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const vacancyId = req.query.id ? String(req.query.id).trim() : '';

  if (vacancyId) {
    const targetRow = await findSheetRowById(VACANCIES_SHEET_NAME, vacancyId);
    if (!targetRow) {
      return res.status(404).json({ error: `Vacancy Error: Vacancy with ID '${vacancyId}' not found.` });
    }
    const vacancy = mapRowToVacancy(targetRow);
    return res.status(200).json({ vacancy });
  }

  const allRows = await readSheetRows(VACANCIES_SHEET_NAME);
  const vacancies = allRows.map(mapRowToVacancy);

  // Публічні користувачі бачать тільки активні вакансії; персонал має доступ до всіх
  const auth = authenticateRequest(req.headers.authorization);
  if (auth.authorized && auth.session && isStaff(auth.session)) {
    return res.status(200).json({ vacancies });
  }

  const activeVacancies = vacancies.filter(v => v.isActive);
  return res.status(200).json({ vacancies: activeVacancies });
}

// --- 2. Обробник створення вакансії (Create Handler) ---

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  if (!isStaff(session)) {
    return res.status(403).json({
      error: 'Forbidden Error: Only Managers and Admins can create vacancies.',
    });
  }

  const {
    title,
    category,
    country,
    salaryNet,
    salaryGross,
    accommodation,
    workingHours,
    description,
    quotaRemaining,
  } = req.body || {};

  const cleanTitle = title ? String(title).trim() : '';
  const cleanCategory = category ? String(category).trim() : '';
  const cleanCountry = country ? String(country).trim() : '';

  if (!cleanTitle || !cleanCategory || !cleanCountry) {
    return res.status(400).json({
      error: 'Validation Error: title, category, and country are required.',
    });
  }

  const vacancyId = `VAC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const newVacancy: Vacancy = {
    id: vacancyId,
    title: cleanTitle,
    category: cleanCategory,
    country: cleanCountry,
    salaryNet: salaryNet ? String(salaryNet).trim() : '',
    salaryGross: salaryGross ? String(salaryGross).trim() : '',
    accommodation: accommodation ? String(accommodation).trim() : '',
    workingHours: workingHours ? String(workingHours).trim() : '',
    description: description ? String(description).trim() : '',
    quotaRemaining: Number(quotaRemaining) || 0,
    isActive: true,
  };

  const rowData = mapVacancyToRow(newVacancy);
  await appendSheetRow(VACANCIES_SHEET_NAME, rowData);

  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'VACANCY_CREATE',
    targetEntity: 'VACANCY',
    targetEntityId: newVacancy.id,
    details: `Created vacancy '${newVacancy.title}' in ${newVacancy.country}`,
  });

  return res.status(201).json({ vacancy: newVacancy });
}

// --- 3. Головна Serverless Точка Входу (Default Handler) ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();

    if (req.method === 'GET') {
      return await handleGet(req, res);
    }

    if (req.method === 'POST') {
      if (action === 'create' || !action) {
        return await handleCreate(req, res);
      }
      return res.status(400).json({
        error: `Invalid action parameter '${action}' for POST request. Allowed: 'create'.`,
      });
    }

    return res.status(405).json({
      error: `HTTP Method '${req.method}' not allowed.`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[API Vacancies Crash]:', errorMessage);

    return res.status(500).json({
      error: `Server Exception: ${errorMessage}`,
    });
  }
}
