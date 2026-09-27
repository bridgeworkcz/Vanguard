import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  PaymentTransaction,
  PaymentReviewStatus,
  DossierPaymentStatus,
  Dossier
} from '../src/types';
import {
  mapRowToPayment,
  mapPaymentToRow,
  mapRowToDossier,
  mapDossierToRow
} from '../server/utils/mappers';
import {
  readSheetRows,
  findSheetRowById,
  appendSheetRow,
  updateSheetRowById
} from '../server/utils/sheets';
import {
  authenticateRequest,
  validateOwnership,
  isStaff
} from '../server/utils/permissions';
import { recordSafeAuditLog } from '../server/utils/audit';
import { sendSafeTelegramAlert, escapeTelegramHtml } from '../server/utils/telegram';

const PAYMENTS_SHEET_NAME = 'PaymentTransactions';
const DOSSIERS_SHEET_NAME = 'Dossiers';

// --- 1. Обробник отримання списку транзакцій (GET Handler) ---

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  const dossierId = req.query.dossierId ? String(req.query.dossierId).trim() : '';

  if (!dossierId) {
    return res.status(400).json({ error: 'Validation Error: Parameter dossierId is required.' });
  }

  // Перевірка існування досьє та прав власності
  const dossierRow = await findSheetRowById(DOSSIERS_SHEET_NAME, dossierId);
  if (!dossierRow) {
    return res.status(404).json({ error: `Dossier Error: Dossier with ID '${dossierId}' not found.` });
  }

  const dossier = mapRowToDossier(dossierRow);
  const ownership = validateOwnership(session, dossier.userId);
  if (!ownership.authorized) {
    return res.status(ownership.statusCode).json({ error: ownership.errorMessage });
  }

  const allPaymentRows = await readSheetRows(PAYMENTS_SHEET_NAME);
  const payments = allPaymentRows
    .map(mapRowToPayment)
    .filter(p => p.dossierId === dossierId);

  return res.status(200).json({ payments });
}

// --- 2. Обробник відправки платежу клієнтом (Submit Handler) ---

async function handleSubmit(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  const { dossierId, amount, currency, network, txHash, tranchePercent } = req.body || {};

  const cleanDossierId = dossierId ? String(dossierId).trim() : '';
  const numAmount = Number(amount) || 0;
  const cleanCurrency = currency ? String(currency).trim().toUpperCase() : 'USDT';
  const cleanNetwork = network ? String(network).trim().toUpperCase() : 'TRC-20';
  const cleanTxHash = txHash ? String(txHash).trim() : '';
  const numTranche = Number(tranchePercent);

  if (!cleanDossierId || numAmount <= 0 || !cleanTxHash) {
    return res.status(400).json({
      error: 'Validation Error: dossierId, positive amount, and txHash are required.',
    });
  }

  if (numTranche !== 20 && numTranche !== 50 && numTranche !== 30) {
    return res.status(400).json({
      error: 'Validation Error: tranchePercent must be 20, 30, or 50.',
    });
  }

  // Перевірка існування досьє та перевірка прав власності
  const dossierRow = await findSheetRowById(DOSSIERS_SHEET_NAME, cleanDossierId);
  if (!dossierRow) {
    return res.status(404).json({ error: `Dossier Error: Dossier with ID '${cleanDossierId}' not found.` });
  }

  const dossier = mapRowToDossier(dossierRow);
  const ownership = validateOwnership(session, dossier.userId);
  if (!ownership.authorized) {
    return res.status(ownership.statusCode).json({ error: ownership.errorMessage });
  }

  const paymentId = `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  const newPayment: PaymentTransaction = {
    id: paymentId,
    dossierId: cleanDossierId,
    userId: session.userId,
    amount: numAmount,
    currency: cleanCurrency,
    network: cleanNetwork,
    txHash: cleanTxHash,
    tranchePercent: numTranche as 20 | 50 | 30,
    status: 'PENDING_REVIEW',
    submittedAt: now,
  };

  const rowData = mapPaymentToRow(newPayment);
  await appendSheetRow(PAYMENTS_SHEET_NAME, rowData);

  // Аудит та сповіщення
  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'PAYMENT_SUBMIT',
    targetEntity: 'PAYMENT',
    targetEntityId: newPayment.id,
    details: `Submitted payment ${numAmount} ${cleanCurrency} (${numTranche}%) tx: ${cleanTxHash}`,
  });

  await sendSafeTelegramAlert(
    `<b>💳 Новий Платіж на Перевірці</b>\n\n` +
    `<b>ID Запиту:</b> <code>${paymentId}</code>\n` +
    `<b>Досьє:</b> <code>${cleanDossierId}</code>\n` +
    `<b>Сума:</b> ${numAmount} ${cleanCurrency} (${cleanNetwork})\n` +
    `<b>Транш:</b> ${numTranche}%\n` +
    `<b>TxHash:</b> <code>${escapeTelegramHtml(cleanTxHash)}</code>\n` +
    `<b>Клієнт:</b> ${escapeTelegramHtml(dossier.fullName)}`
  );

  return res.status(201).json({ payment: newPayment });
}

// --- 3. Обробник верифікації платежу персоналом (Verify Handler) ---

async function handleVerify(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  if (!isStaff(session)) {
    return res.status(403).json({
      error: 'Forbidden Error: Only Managers and Admins can verify payments.',
    });
  }

  const { paymentId, status } = req.body || {};
  const cleanPaymentId = paymentId ? String(paymentId).trim() : '';
  const cleanStatus = status ? (String(status).trim().toUpperCase() as PaymentReviewStatus) : ('' as PaymentReviewStatus);

  if (!cleanPaymentId || !cleanStatus) {
    return res.status(400).json({ error: 'Validation Error: paymentId and status are required.' });
  }

  if (cleanStatus !== 'CONFIRMED' && cleanStatus !== 'REJECTED' && cleanStatus !== 'REFUNDED') {
    return res.status(400).json({
      error: "Validation Error: Payment status must be 'CONFIRMED', 'REJECTED', or 'REFUNDED'.",
    });
  }

  const paymentRow = await findSheetRowById(PAYMENTS_SHEET_NAME, cleanPaymentId);
  if (!paymentRow) {
    return res.status(404).json({ error: `Payment Error: Payment with ID '${cleanPaymentId}' not found.` });
  }

  const existingPayment = mapRowToPayment(paymentRow);
  const now = new Date().toISOString();

  const updatedPayment: PaymentTransaction = {
    ...existingPayment,
    status: cleanStatus,
    verifiedAt: now,
    verifiedBy: session.userId,
  };

  const paymentRowData = mapPaymentToRow(updatedPayment);
  await updateSheetRowById(PAYMENTS_SHEET_NAME, cleanPaymentId, paymentRowData);

  // Серверний перерахунок фінансового балансу досьє при зміні статусу платежу
  const dossierRow = await findSheetRowById(DOSSIERS_SHEET_NAME, existingPayment.dossierId);
  if (dossierRow) {
    const dossier = mapRowToDossier(dossierRow);

    // Отримання всіх підтверджених платежів за цим досьє
    const allPaymentRows = await readSheetRows(PAYMENTS_SHEET_NAME);
    const confirmedPayments = allPaymentRows
      .map(mapRowToPayment)
      .filter(p => p.dossierId === dossier.id && p.status === 'CONFIRMED');

    const totalPaidAmount = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);
    const remainingAmount = Math.max(0, dossier.totalCost - totalPaidAmount);

    let dossierPaymentStatus: DossierPaymentStatus = dossier.paymentStatus;
    if (totalPaidAmount === 0) {
      dossierPaymentStatus = 'NOT_DUE';
    } else if (remainingAmount === 0 && totalPaidAmount > 0) {
      dossierPaymentStatus = 'PAID';
    } else if (totalPaidAmount > 0 && remainingAmount > 0) {
      dossierPaymentStatus = 'PARTIALLY_PAID';
    }

    const updatedDossier: Dossier = {
      ...dossier,
      paidAmount: totalPaidAmount,
      remainingAmount,
      paymentStatus: dossierPaymentStatus,
      updatedAt: now,
    };

    const dossierRowData = mapDossierToRow(updatedDossier);
    await updateSheetRowById(DOSSIERS_SHEET_NAME, dossier.id, dossierRowData);
  }

  // Аудит та сповіщення
  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'PAYMENT_VERIFY',
    targetEntity: 'PAYMENT',
    targetEntityId: cleanPaymentId,
    details: `Updated payment status to ${cleanStatus}`,
  });

  await sendSafeTelegramAlert(
    `<b>✅ Верифікація Платежу</b>\n\n` +
    `<b>Платіж ID:</b> <code>${cleanPaymentId}</code>\n` +
    `<b>Досьє:</b> <code>${existingPayment.dossierId}</code>\n` +
    `<b>Статус:</b> <code>${cleanStatus}</code>\n` +
    `<b>Сума:</b> ${existingPayment.amount} ${existingPayment.currency}\n` +
    `<b>Менеджер:</b> <code>${session.userId}</code>`
  );

  return res.status(200).json({ payment: updatedPayment });
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
      if (action === 'submit' || !action) {
        return await handleSubmit(req, res);
      }
      if (action === 'verify') {
        return await handleVerify(req, res);
      }
      return res.status(400).json({
        error: `Invalid action parameter '${action}' for POST request. Allowed: 'submit', 'verify'.`,
      });
    }

    return res.status(405).json({
      error: `HTTP Method '${req.method}' not allowed.`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[API Payments Crash]:', errorMessage);

    return res.status(500).json({
      error: `Server Exception: ${errorMessage}`,
    });
  }
}
