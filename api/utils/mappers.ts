import {
  User,
  Dossier,
  PaymentTransaction,
  DossierDocument,
  Vacancy,
  TeamMember,
  AuditLogEntry,
  Role,
  ProcessStatus,
  DossierPaymentStatus,
  PaymentReviewStatus,
  DocumentStatus,
  DocumentCategory
} from '../../src/types';

// --- Допоміжні утиліти безпечного приведення типів ---

function safeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return isNaN(parsed) ? fallback : parsed;
}

function safeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return fallback;
}

function safeArrayString(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(item => safeString(item)).filter(Boolean);
  const str = safeString(value);
  if (!str) return [];
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map(item => safeString(item)).filter(Boolean);
    } catch {
      // Ігноруємо помилку JSON.parse та падаємо на split
    }
  }
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function parseRoles(value: unknown): Role[] {
  const rawArray = safeArrayString(value);
  const validRoles: Role[] = ['CLIENT', 'MANAGER', 'ADMIN'];
  const roles = rawArray.filter((r): r is Role => validRoles.includes(r as Role));
  return roles.length > 0 ? roles : ['CLIENT'];
}

// --- 1. User Mapper ---

export function mapRowToUser(record: Record<string, string>): User {
  return {
    id: safeString(record.id || record.userId),
    email: safeString(record.email),
    phone: safeString(record.phone),
    fullName: safeString(record.fullName),
    roles: parseRoles(record.roles),
    createdAt: safeString(record.createdAt, new Date().toISOString()),
    lastLoginAt: record.lastLoginAt ? safeString(record.lastLoginAt) : undefined,
  };
}

export function mapUserToRow(user: User): Record<string, string> {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    roles: JSON.stringify(user.roles),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || '',
  };
}

// --- 2. Dossier Mapper ---

export function mapRowToDossier(record: Record<string, string>): Dossier {
  const totalCost = safeNumber(record.totalCost || record.totalAmount);
  const paidAmount = safeNumber(record.paidAmount);
  const remainingAmount = record.remainingAmount !== undefined
    ? safeNumber(record.remainingAmount)
    : Math.max(0, totalCost - paidAmount);

  return {
    id: safeString(record.id || record.dossierId),
    userId: safeString(record.userId),
    fullName: safeString(record.fullName),
    passportNumber: safeString(record.passportNumber || record.passportNo),
    citizenship: safeString(record.citizenship || record.countryOrigin),
    targetCountry: safeString(record.targetCountry || record.countryDest),
    vacancyId: record.vacancyId ? safeString(record.vacancyId) : undefined,
    vacancyTitle: record.vacancyTitle ? safeString(record.vacancyTitle) : undefined,
    processStatus: safeString(record.processStatus || record.stageName, 'NEW') as ProcessStatus,
    paymentStatus: safeString(record.paymentStatus, 'NOT_DUE') as DossierPaymentStatus,
    currency: safeString(record.currency, 'EUR'),
    totalCost,
    paidAmount,
    remainingAmount,
    assignedManagerId: record.assignedManagerId ? safeString(record.assignedManagerId) : undefined,
    createdAt: safeString(record.createdAt, new Date().toISOString()),
    updatedAt: safeString(record.updatedAt, new Date().toISOString()),
  };
}

export function mapDossierToRow(dossier: Dossier): Record<string, string> {
  return {
    id: dossier.id,
    userId: dossier.userId,
    fullName: dossier.fullName,
    passportNumber: dossier.passportNumber,
    citizenship: dossier.citizenship,
    targetCountry: dossier.targetCountry,
    vacancyId: dossier.vacancyId || '',
    vacancyTitle: dossier.vacancyTitle || '',
    processStatus: dossier.processStatus,
    paymentStatus: dossier.paymentStatus,
    currency: dossier.currency,
    totalCost: String(dossier.totalCost),
    paidAmount: String(dossier.paidAmount),
    remainingAmount: String(dossier.remainingAmount),
    assignedManagerId: dossier.assignedManagerId || '',
    createdAt: dossier.createdAt,
    updatedAt: dossier.updatedAt,
  };
}

// --- 3. PaymentTransaction Mapper ---

export function mapRowToPayment(record: Record<string, string>): PaymentTransaction {
  const rawTranche = safeNumber(record.tranchePercent || record.trancheStage, 20);
  const tranchePercent = (rawTranche === 50 || rawTranche === 30) ? rawTranche : 20;

  return {
    id: safeString(record.id || record.paymentId),
    dossierId: safeString(record.dossierId),
    userId: safeString(record.userId),
    amount: safeNumber(record.amount || record.amountUsdt),
    currency: safeString(record.currency, 'USDT'),
    network: safeString(record.network, 'TRC-20'),
    txHash: safeString(record.txHash),
    tranchePercent,
    status: safeString(record.status, 'PENDING_REVIEW') as PaymentReviewStatus,
    submittedAt: safeString(record.submittedAt || record.timestamp, new Date().toISOString()),
    verifiedAt: record.verifiedAt ? safeString(record.verifiedAt) : undefined,
    verifiedBy: record.verifiedBy ? safeString(record.verifiedBy) : undefined,
  };
}

export function mapPaymentToRow(payment: PaymentTransaction): Record<string, string> {
  return {
    id: payment.id,
    dossierId: payment.dossierId,
    userId: payment.userId,
    amount: String(payment.amount),
    currency: payment.currency,
    network: payment.network,
    txHash: payment.txHash,
    tranchePercent: String(payment.tranchePercent),
    status: payment.status,
    submittedAt: payment.submittedAt,
    verifiedAt: payment.verifiedAt || '',
    verifiedBy: payment.verifiedBy || '',
  };
}

// --- 4. DossierDocument Mapper ---

export function mapRowToDocument(record: Record<string, string>): DossierDocument {
  return {
    id: safeString(record.id || record.docId),
    dossierId: safeString(record.dossierId),
    category: safeString(record.category, 'PASSPORT') as DocumentCategory,
    fileName: safeString(record.fileName),
    driveFileId: record.driveFileId ? safeString(record.driveFileId) : undefined,
    status: safeString(record.status, 'MISSING') as DocumentStatus,
    uploadedAt: safeString(record.uploadedAt || record.timestamp, new Date().toISOString()),
    reviewedAt: record.reviewedAt ? safeString(record.reviewedAt) : undefined,
    reviewedBy: record.reviewedBy ? safeString(record.reviewedBy) : undefined,
    rejectionReason: record.rejectionReason ? safeString(record.rejectionReason) : undefined,
  };
}

export function mapDocumentToRow(doc: DossierDocument): Record<string, string> {
  return {
    id: doc.id,
    dossierId: doc.dossierId,
    category: doc.category,
    fileName: doc.fileName,
    driveFileId: doc.driveFileId || '',
    status: doc.status,
    uploadedAt: doc.uploadedAt,
    reviewedAt: doc.reviewedAt || '',
    reviewedBy: doc.reviewedBy || '',
    rejectionReason: doc.rejectionReason || '',
  };
}

// --- 5. Vacancy Mapper ---

export function mapRowToVacancy(record: Record<string, string>): Vacancy {
  return {
    id: safeString(record.id || record.vacancyId),
    title: safeString(record.title),
    category: safeString(record.category),
    country: safeString(record.country),
    salaryNet: safeString(record.salaryNet),
    salaryGross: safeString(record.salaryGross),
    accommodation: safeString(record.accommodation),
    workingHours: safeString(record.workingHours),
    description: safeString(record.description),
    quotaRemaining: safeNumber(record.quotaRemaining),
    isActive: safeBoolean(record.isActive, true),
  };
}

export function mapVacancyToRow(vacancy: Vacancy): Record<string, string> {
  return {
    id: vacancy.id,
    title: vacancy.title,
    category: vacancy.category,
    country: vacancy.country,
    salaryNet: vacancy.salaryNet,
    salaryGross: vacancy.salaryGross,
    accommodation: vacancy.accommodation,
    workingHours: vacancy.workingHours,
    description: vacancy.description,
    quotaRemaining: String(vacancy.quotaRemaining),
    isActive: String(vacancy.isActive),
  };
}

// --- 6. TeamMember Mapper ---

export function mapRowToTeamMember(record: Record<string, string>): TeamMember {
  return {
    id: safeString(record.id || record.memberId),
    fullName: safeString(record.fullName),
    position: safeString(record.position),
    photoUrl: safeString(record.photoUrl),
    languages: safeArrayString(record.languages),
    bio: safeString(record.bio),
    order: safeNumber(record.order, 1),
  };
}

export function mapTeamMemberToRow(member: TeamMember): Record<string, string> {
  return {
    id: member.id,
    fullName: member.fullName,
    position: member.position,
    photoUrl: member.photoUrl,
    languages: JSON.stringify(member.languages),
    bio: member.bio,
    order: String(member.order),
  };
}

// --- 7. AuditLogEntry Mapper ---

export function mapRowToAuditLog(record: Record<string, string>): AuditLogEntry {
  return {
    id: safeString(record.id || record.logId),
    actorUserId: safeString(record.actorUserId || record.adminName),
    action: safeString(record.action),
    targetEntity: safeString(record.targetEntity, 'DOSSIER'),
    targetEntityId: safeString(record.targetEntityId || record.targetDossierId),
    details: record.details ? safeString(record.details) : undefined,
    timestamp: safeString(record.timestamp, new Date().toISOString()),
  };
}

export function mapAuditLogToRow(entry: AuditLogEntry): Record<string, string> {
  return {
    id: entry.id,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetEntity: entry.targetEntity,
    targetEntityId: entry.targetEntityId,
    details: entry.details || '',
    timestamp: entry.timestamp,
  };
}
