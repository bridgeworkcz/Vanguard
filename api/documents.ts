import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DossierDocument, DocumentCategory, DocumentStatus } from '../src/types';
import { mapRowToDocument, mapDocumentToRow, mapRowToDossier } from '../server/utils/mappers';
import { readSheetRows, findSheetRowById, appendSheetRow, updateSheetRowById } from '../server/utils/sheets';
import { uploadFileToDrive, getDossierCategoryFolder } from '../server/utils/drive';
import { authenticateRequest, validateOwnership, isStaff } from '../server/utils/permissions';
import { recordSafeAuditLog } from '../server/utils/audit';
import { sendSafeTelegramAlert, escapeTelegramHtml } from '../server/utils/telegram';

const DOCUMENTS_SHEET_NAME = 'DossierDocuments';
const DOSSIERS_SHEET_NAME = 'Dossiers';

const VALID_CATEGORIES: DocumentCategory[] = [
  'PASSPORT',
  'POLICE_CLEARANCE',
  'EDUCATION_DIPLOMA',
  'MEDICAL_CLEARANCE',
  'CONTRACT',
];

// --- 1. Обробник отримання документів (GET Handler) ---

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

  // Перевірка існування досьє
  const dossierRow = await findSheetRowById(DOSSIERS_SHEET_NAME, dossierId);
  if (!dossierRow) {
    return res.status(404).json({ error: `Dossier Error: Dossier with ID '${dossierId}' not found.` });
  }

  const dossier = mapRowToDossier(dossierRow);

  // Валідація права власності (Ownership Check)
  const ownership = validateOwnership(session, dossier.userId);
  if (!ownership.authorized) {
    return res.status(ownership.statusCode).json({ error: ownership.errorMessage });
  }

  const allDocRows = await readSheetRows(DOCUMENTS_SHEET_NAME);
  const dossierDocs = allDocRows
    .map(mapRowToDocument)
    .filter(doc => doc.dossierId === dossierId);

  return res.status(200).json({ documents: dossierDocs });
}

// --- 2. Обробник завантаження документа (Upload Handler) ---

async function handleUpload(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;
  const { dossierId, category, fileName, mimeType, fileBase64 } = req.body || {};

  const cleanDossierId = dossierId ? String(dossierId).trim() : '';
  const cleanCategory = category ? (String(category).trim().toUpperCase() as DocumentCategory) : ('' as DocumentCategory);
  const cleanFileName = fileName ? String(fileName).trim() : '';
  const cleanMimeType = mimeType ? String(mimeType).trim() : 'application/pdf';
  const cleanBase64 = fileBase64 ? String(fileBase64).trim() : '';

  if (!cleanDossierId || !cleanCategory || !cleanFileName || !cleanBase64) {
    return res.status(400).json({
      error: 'Validation Error: dossierId, category, fileName, and fileBase64 are required.',
    });
  }

  if (!VALID_CATEGORIES.includes(cleanCategory)) {
    return res.status(400).json({
      error: `Validation Error: Invalid category '${cleanCategory}'. Allowed: ${VALID_CATEGORIES.join(', ')}`,
    });
  }

  // Перевірка досьє та прав власності
  const dossierRow = await findSheetRowById(DOSSIERS_SHEET_NAME, cleanDossierId);
  if (!dossierRow) {
    return res.status(404).json({ error: `Dossier Error: Dossier with ID '${cleanDossierId}' not found.` });
  }

  const dossier = mapRowToDossier(dossierRow);
  const ownership = validateOwnership(session, dossier.userId);
  if (!ownership.authorized) {
    return res.status(ownership.statusCode).json({ error: ownership.errorMessage });
  }

  // Декодування Base64 у бінарний Buffer
  const fileBuffer = Buffer.from(cleanBase64, 'base64');
  if (fileBuffer.length === 0) {
    return res.status(400).json({ error: 'Upload Error: Decoded file buffer is empty.' });
  }

  // Отримання або створення папки в Drive Vault: Dossiers/{dossierId}/{category}
  const categoryFolderId = await getDossierCategoryFolder(cleanDossierId, cleanCategory);

  // Завантаження файлу в Google Drive Vault
  const driveResult = await uploadFileToDrive(
    categoryFolderId,
    cleanFileName,
    cleanMimeType,
    fileBuffer
  );

  const docId = `DOC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  const newDoc: DossierDocument = {
    id: docId,
    dossierId: cleanDossierId,
    category: cleanCategory,
    fileName: cleanFileName,
    driveFileId: driveResult.fileId,
    status: 'UPLOADED',
    uploadedAt: now,
  };

  const rowData = mapDocumentToRow(newDoc);
  await appendSheetRow(DOCUMENTS_SHEET_NAME, rowData);

  // Аудит та сповіщення
  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'DOCUMENT_UPLOAD',
    targetEntity: 'DOCUMENT',
    targetEntityId: newDoc.id,
    details: `Uploaded ${cleanCategory} for dossier ${cleanDossierId}`,
  });

  await sendSafeTelegramAlert(
    `<b>📄 Новий Документ Завантажено</b>\n\n` +
    `<b>Досьє:</b> <code>${cleanDossierId}</code>\n` +
    `<b>Категорія:</b> <code>${cleanCategory}</code>\n` +
    `<b>Файл:</b> ${escapeTelegramHtml(cleanFileName)}\n` +
    `<b>Клієнт:</b> ${escapeTelegramHtml(dossier.fullName)}`
  );

  return res.status(201).json({ document: newDoc });
}

// --- 3. Обробник верифікації документа (Review Handler) ---

async function handleReview(req: VercelRequest, res: VercelResponse) {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.authorized || !auth.session) {
    return res.status(auth.statusCode).json({ error: auth.errorMessage });
  }

  const { session } = auth;

  // Верифікувати документи має право лише персонал (MANAGER або ADMIN)
  if (!isStaff(session)) {
    return res.status(403).json({
      error: 'Forbidden Error: Only Managers and Admins can review documents.',
    });
  }

  const { documentId, status, rejectionReason } = req.body || {};
  const cleanDocId = documentId ? String(documentId).trim() : '';
  const cleanStatus = status ? (String(status).trim().toUpperCase() as DocumentStatus) : ('' as DocumentStatus);

  if (!cleanDocId || !cleanStatus) {
    return res.status(400).json({ error: 'Validation Error: documentId and status are required.' });
  }

  if (cleanStatus !== 'APPROVED' && cleanStatus !== 'REJECTED') {
    return res.status(400).json({
      error: "Validation Error: Document review status must be either 'APPROVED' or 'REJECTED'.",
    });
  }

  const docRow = await findSheetRowById(DOCUMENTS_SHEET_NAME, cleanDocId);
  if (!docRow) {
    return res.status(404).json({ error: `Document Error: Document with ID '${cleanDocId}' not found.` });
  }

  const existingDoc = mapRowToDocument(docRow);
  const now = new Date().toISOString();

  const updatedDoc: DossierDocument = {
    ...existingDoc,
    status: cleanStatus,
    reviewedAt: now,
    reviewedBy: session.userId,
    rejectionReason: cleanStatus === 'REJECTED' ? (rejectionReason ? String(rejectionReason).trim() : 'Document rejected by reviewer') : undefined,
  };

  const rowData = mapDocumentToRow(updatedDoc);
  await updateSheetRowById(DOCUMENTS_SHEET_NAME, cleanDocId, rowData);

  // Аудит та сповіщення
  await recordSafeAuditLog({
    actorUserId: session.userId,
    action: 'DOCUMENT_REVIEW',
    targetEntity: 'DOCUMENT',
    targetEntityId: cleanDocId,
    details: `Reviewed document status to ${cleanStatus}`,
  });

  await sendSafeTelegramAlert(
    `<b>📋 Верифікація Документа</b>\n\n` +
    `<b>Документ ID:</b> <code>${cleanDocId}</code>\n` +
    `<b>Категорія:</b> <code>${updatedDoc.category}</code>\n` +
    `<b>Статус:</b> <code>${cleanStatus}</code>\n` +
    `<b>Менеджер:</b> <code>${session.userId}</code>`
  );

  return res.status(200).json({ document: updatedDoc });
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
      if (action === 'upload' || !action) {
        return await handleUpload(req, res);
      }
      if (action === 'review') {
        return await handleReview(req, res);
      }
      return res.status(400).json({
        error: `Invalid action parameter '${action}' for POST request. Allowed: 'upload', 'review'.`,
      });
    }

    return res.status(405).json({
      error: `HTTP Method '${req.method}' not allowed.`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[API Documents Crash]:', errorMessage);

    return res.status(500).json({
      error: `Server Exception: ${errorMessage}`,
    });
  }
}
