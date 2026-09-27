import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Dossier, ProcessStatus, DossierPaymentStatus } from '../src/types';
import { mapRowToDossier, mapDossierToRow } from '../server/utils/mappers';
import { readSheetRows, findSheetRowById, appendSheetRow, updateSheetRowById } from '../server/utils/sheets';
import { authenticateRequest, validateOwnership, isStaff } from '../server/utils/permissions';
import { recordSafeAuditLog } from '../server/utils/audit';
import { sendSafeTelegramAlert, escapeTelegramHtml } from '../server/utils/telegram';

const DOSSIERS_SHEET_NAME = 'Dossiers';

// --- 1. Обробник отримання списку / конкретного досьє (GET Handler) ---

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  const dossierId = req.query.id ? String(req.query.id).trim() : '';

  // Отримання конкретного досьє за ID
  if (dossierId) {
    const targetRow = await findSheetRowById(DOSSIERS_SHEET_NAME, dossierId);
    if (!targetRow) {
      return res.status(404).json({ error: `Dossier Error: Dossier with ID '${dossierId}' not found.` });
    }

    const dossier = mapRowToDossier(targetRow);

    // Валідація права власності (Ownership Check)
    const ownership = validateOwnership(session, dossier.userId);
    if (!ownership.authorized) {
      return res.status(ownership.statusCode).json({ error: ownership.errorMessage });
    }

    return res.status(200).json({ dossier });
  }

  // Отримання списку досьє
  const allRows = await readSheetRows(DOSSIERS_SHEET_NAME);
  const allDossiers = allRows.map(mapRowToDossier);

  // Для клієнтів повертаємо тільки їхні власні досьє; для менеджерів/адмінів — всі
  if (isStaff(session)) {
    return res.status(200).json({ dossiers: allDossiers });
  }

  const userDossiers = allDossiers.filter(d => d.userId === session.userId);
  return res.status(200).json({ dossiers: userDossiers });
}

// --- 2. Обробник створення досьє (Create Handler) ---

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  const {
    fullName,
    passportNumber,
    citizenship,
    targetCountry,
    vacancyId,
    vacancyTitle,
    totalCost,
    currency
  } = req.body || {};

  const cleanFullName = fullName ? String(fullName).trim() : '';
  const cleanPassport = passportNumber ? String(passportNumber).trim() : '';
  const cleanCitizenship = citizenship ? String(citizenship).trim() : '';
  const cleanTargetCountry = targetCountry ? String(targetCountry).trim() : '';
  const numTotalCost = Number(totalCost) || 0;
  const cleanCurrency = currency ? String(currency).trim().toUpperCase() : 'EUR';

  if (!cleanFullName || !cleanPassport || !cleanCitizenship || !cleanTargetCountry) {
    return res.status(400).json({
      error: 'Validation Error: Full name, passport number, citizenship, and target country are required.'
    });
  }

  const dossierId = `DOS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  const newDossier: Dossier = {
    id: dossierId,
    userId: session.userId,
    fullName: cleanFullName,
    passportNumber: cleanPassport,
    citizenship: cleanCitizenship,
    targetCountry: cleanTargetCountry,
    vacancyId: vacancyId ? String(vacancyId).trim() : undefined,
    vacancyTitle: vacancyTitle ? String(vacancyTitle).trim() : undefined,
    processStatus: 'NEW',
    paymentStatus: 'NOT_DUE',
    currency: cleanCurrency,
    totalCost: numTotalCost,
    paidAmount: 0,
    remainingAmount: numTotalCost,
    createdAt: now,
    updatedAt: now,
  };

  const rowData = mapDossierToRow(newDossier);
  await appendSheetRow(DOSSIERS_SHEET_NAME, rowData);

  // Фіксація в Audit Log
  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'DOSSIER_CREATE',
    targetEntity: 'DOSSIER',
    targetEntityId: newDossier.id,
    details: `Created dossier for ${escapeTelegramHtml(cleanFullName)} (${cleanTargetCountry})`
  });

  // Відправка сповіщення у Telegram
  await sendSafeTelegramAlert(
    `<b>📂 Нове Досьє Створено</b>\n\n` +
    `<b>ID:</b> <code>${newDossier.id}</code>\n` +
    `<b>Клієнт:</b> ${escapeTelegramHtml(cleanFullName)}\n` +
    `<b>Паспорт:</b> ${escapeTelegramHtml(cleanPassport)}\n` +
    `<b>Країна призначення:</b> ${escapeTelegramHtml(cleanTargetCountry)}\n` +
    `<b>Вартість:</b> ${numTotalCost} ${cleanCurrency}`
  );

  return res.status(201).json({ dossier: newDossier });
}

// --- 3. Обробник оновлення статусу досьє (Update Status Handler) ---

async function handleUpdateStatus(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;

  // Тільки менеджер або адмін мають право змінювати процесуальний статус досьє
  if (!isStaff(session)) {
    return res.status(403).json({
      error: 'Forbidden Error: Only Managers and Admins can update process or payment status.'
    });
  }

  const { dossierId, processStatus, paymentStatus, assignedManagerId } = req.body || {};
  const cleanDossierId = dossierId ? String(dossierId).trim() : '';

  if (!cleanDossierId) {
    return res.status(400).json({ error: 'Validation Error: Parameter dossierId is required.' });
  }

  const targetRow = await findSheetRowById(DOSSIERS_SHEET_NAME, cleanDossierId);
  if (!targetRow) {
    return res.status(404).json({ error: `Dossier Error: Dossier with ID '${cleanDossierId}' not found.` });
  }

  const existingDossier = mapRowToDossier(targetRow);
  const now = new Date().toISOString();

  const updateData: Partial<Dossier> = {
    updatedAt: now,
  };

  if (processStatus) {
    updateData.processStatus = String(processStatus).trim() as ProcessStatus;
  }

  if (paymentStatus) {
    updateData.paymentStatus = String(paymentStatus).trim() as DossierPaymentStatus;
  }

  if (assignedManagerId !== undefined) {
    updateData.assignedManagerId = String(assignedManagerId).trim();
  }

  const updatedDossier: Dossier = {
    ...existingDossier,
    ...updateData,
  };

  const rowData = mapDossierToRow(updatedDossier);
  await updateSheetRowById(DOSSIERS_SHEET_NAME, cleanDossierId, rowData);

  // Фіксація в Audit Log
  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'DOSSIER_UPDATE_STATUS',
    targetEntity: 'DOSSIER',
    targetEntityId: cleanDossierId,
    details: `Updated status: process=${updatedDossier.processStatus}, payment=${updatedDossier.paymentStatus}`
  });

  // Telegram сповіщення
  await sendSafeTelegramAlert(
    `<b>🔄 Зміна Статусу Досьє</b>\n\n` +
    `<b>ID:</b> <code>${cleanDossierId}</code>\n` +
    `<b>Клієнт:</b> ${escapeTelegramHtml(updatedDossier.fullName)}\n` +
    `<b>Процес:</b> <code>${updatedDossier.processStatus}</code>\n` +
    `<b>Оплата:</b> <code>${updatedDossier.paymentStatus}</code>`
  );

  return res.status(200).json({ dossier: updatedDossier });
}

// --- 4. Головна Serverless Точка Входу (Default Handler) ---

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
      if (action === 'updatestatus') {
        return await handleUpdateStatus(req, res);
      }
      return res.status(400).json({
        error: `Invalid action parameter '${action}' for POST request. Allowed: 'create', 'updateStatus'.`
      });
    }

    return res.status(405).json({
      error: `HTTP Method '${req.method}' not allowed.`
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[API Dossiers Crash]:', errorMessage);

    return res.status(500).json({
      error: `Server Exception: ${errorMessage}`
    });
  }
}
