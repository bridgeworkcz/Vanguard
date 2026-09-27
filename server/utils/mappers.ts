import type {
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

// --- Допоміжні функції строгої валідації та безпечного приведення типів ---

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function requireString(value: unknown, fieldName: string): string {
  const str = safeString(value);
  if (!str) {
    throw new Error(`Validation Error: Missing required string field '${fieldName}'`);
  }
  return str;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Validation Error: Missing required numeric field '${fieldName}'`);
  }
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Validation Error: Invalid numeric value for field '${fieldName}': '${value}'`);
  }
  return parsed;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  throw new Error(`Validation Error: Missing or invalid boolean value for field '${fieldName}': '${value}'`);
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
      // Якщо парсинг JSON не вдався, здійснюємо розбиття за комою
    }
  }
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

// --- Валідатори Enum та спеціальних значень ---

const VALID_ROLES: Role[] = ['CLIENT', 'MANAGER', 'ADMIN'];

function parseRoles(value: unknown): Role[] {
  const rawArray = safeArrayString(value);
  if (rawArray.length === 0) {
    throw new Error("Validation Error: Field 'roles' is missing or empty");
  }
  const roles = rawArray.filter((r): r is Role => VALID_ROLES.includes(r as Role));
  if (roles.length !== rawArray.length) {
    throw new Error(`Validation Error: Field 'roles' contains invalid role definition: '${safeString(value)}'`);
  }
  return roles;
}

const VALID_PROCESS_STATUSES: ProcessStatus[] = [
  'NEW',
  'DOCUMENTS_REQUIRED',
  'DOCUMENTS_REVIEW',
  'LEGAL_REVIEW',
  'READY_FOR_FILING',
  'FILED',
  'PROCESSING',
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'ON_HOLD',
  'CANCELLED'
];

function parseProcessStatus(value: unknown): ProcessStatus {
  const str = requireString(value, 'processStatus');
  if (!VALID_PROCESS_STATUSES.includes(str as ProcessStatus)) {
    throw new Error(`Validation Error: Invalid processStatus '${str}'`);
  }
  return str as ProcessStatus;
}

const VALID_DOSSIER_PAYMENT_STATUSES: DossierPaymentStatus[] = [
  'NOT_DUE',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE'
];

function parseDossierPaymentStatus(value: unknown): DossierPaymentStatus {
  const str = requireString(value, 'paymentStatus');
  if (!VALID_DOSSIER_PAYMENT_STATUSES.includes(str as DossierPaymentStatus)) {
    throw new Error(`Validation Error: Invalid paymentStatus '${str}'`);
  }
  return str as DossierPaymentStatus;
}

const VALID_PAYMENT_REVIEW_STATUSES: PaymentReviewStatus[] = [
  'PENDING_REVIEW',
  'CONFIRMED',
  'REJECTED',
  'REFUNDED'
];

function parsePaymentReviewStatus(value: unknown): PaymentReviewStatus {
  const str = requireString(value, 'status');
  if (!VALID_PAYMENT_REVIEW_STATUSES.includes(str as PaymentReviewStatus)) {
    throw new Error(`Validation Error: Invalid PaymentReviewStatus '${str}'`);
  }
  return str as PaymentReviewStatus;
}

const VALID_DOCUMENT_STATUSES: DocumentStatus[] = [
  'MISSING',
  'UPLOADED',
  'APPROVED',
  'REJECTED'
];

function parseDocumentStatus(value: unknown): DocumentStatus {
  const str = requireString(value, 'status');
  if (!VALID_DOCUMENT_STATUSES.includes(str as DocumentStatus)) {
    throw new Error(`Validation Error: Invalid DocumentStatus '${str}'`);
  }
  return str as DocumentStatus;
}

const VALID_DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'PASSPORT',
  'POLICE_CLEARANCE',
  'EDUCATION_DIPLOMA',
  'MEDICAL_CLEARANCE',
  'CONTRACT'
];

function parseDocumentCategory(value: unknown): DocumentCategory {
  const str = requireString(value, 'category');
  if (!VALID_DOCUMENT_CATEGORIES.includes(str as DocumentCategory)) {
    throw new Error(`Validation Error: Invalid DocumentCategory '${str}'`);
  }
  return str as DocumentCategory;
}

function parseTranchePercent(value: unknown): 20 | 50 | 30 {
  const num = requireNumber(value, 'tranchePercent');
  if (num === 20 || num === 50 || num === 30) {
    return num;
  }
  throw new Error(`Validation Error: Invalid tranchePercent '${value}'. Allowed values are 20, 50, 30.`);
}

// --- 1. User Mapper ---

export function mapRowToUser(record: Record<string, string>): User {
  return {
    id: requireString(record.id, 'id'),
    email: requireString(record.email, 'email'),
    phone: requireString(record.phone, 'phone'),
    fullName: requireString(record.fullName, 'fullName'),
    roles: parseRoles(record.roles),
    createdAt: requireString(record.createdAt, 'createdAt'),
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
  return {
    id: requireString(record.id, 'id'),
    userId: requireString(record.userId, 'userId'),
    fullName: requireString(record.fullName, 'fullName'),
    passportNumber: requireString(record.passportNumber, 'passportNumber'),
    citizenship: requireString(record.citizenship, 'citizenship'),
    targetCountry: requireString(record.targetCountry, 'targetCountry'),
    vacancyId: record.vacancyId ? safeString(record.vacancyId) : undefined,
    vacancyTitle: record.vacancyTitle ? safeString(record.vacancyTitle) : undefined,
    processStatus: parseProcessStatus(record.processStatus),
    paymentStatus: parseDossierPaymentStatus(record.paymentStatus),
    currency: requireString(record.currency, 'currency'),
    totalCost: requireNumber(record.totalCost, 'totalCost'),
    paidAmount: requireNumber(record.paidAmount, 'paidAmount'),
    remainingAmount: requireNumber(record.remainingAmount, 'remainingAmount'),
    assignedManagerId: record.assignedManagerId ? safeString(record.assignedManagerId) : undefined,
    createdAt: requireString(record.createdAt, 'createdAt'),
    updatedAt: requireString(record.updatedAt, 'updatedAt'),
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
  return {
    id: requireString(record.id, 'id'),
    dossierId: requireString(record.dossierId, 'dossierId'),
    userId: requireString(record.userId, 'userId'),
    amount: requireNumber(record.amount, 'amount'),
    currency: requireString(record.currency, 'currency'),
    network: requireString(record.network, 'network'),
    txHash: requireString(record.txHash, 'txHash'),
    tranchePercent: parseTranchePercent(record.tranchePercent),
    status: parsePaymentReviewStatus(record.status),
    submittedAt: requireString(record.submittedAt, 'submittedAt'),
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
    id: requireString(record.id, 'id'),
    dossierId: requireString(record.dossierId, 'dossierId'),
    category: parseDocumentCategory(record.category),
    fileName: requireString(record.fileName, 'fileName'),
    driveFileId: record.driveFileId ? safeString(record.driveFileId) : undefined,
    status: parseDocumentStatus(record.status),
    uploadedAt: requireString(record.uploadedAt, 'uploadedAt'),
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
    id: requireString(record.id, 'id'),
    title: requireString(record.title, 'title'),
    category: requireString(record.category, 'category'),
    country: requireString(record.country, 'country'),
    salaryNet: requireString(record.salaryNet, 'salaryNet'),
    salaryGross: requireString(record.salaryGross, 'salaryGross'),
    accommodation: requireString(record.accommodation, 'accommodation'),
    workingHours: requireString(record.workingHours, 'workingHours'),
    description: requireString(record.description, 'description'),
    quotaRemaining: requireNumber(record.quotaRemaining, 'quotaRemaining'),
    isActive: requireBoolean(record.isActive, 'isActive'),
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
    id: requireString(record.id, 'id'),
    fullName: requireString(record.fullName, 'fullName'),
    position: requireString(record.position, 'position'),
    photoUrl: requireString(record.photoUrl, 'photoUrl'),
    languages: safeArrayString(record.languages),
    bio: requireString(record.bio, 'bio'),
    order: requireNumber(record.order, 'order'),
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
    id: requireString(record.id, 'id'),
    actorUserId: requireString(record.actorUserId, 'actorUserId'),
    action: requireString(record.action, 'action'),
    targetEntity: requireString(record.targetEntity, 'targetEntity'),
    targetEntityId: requireString(record.targetEntityId, 'targetEntityId'),
    details: record.details ? safeString(record.details) : undefined,
    timestamp: requireString(record.timestamp, 'timestamp'),
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

export {};

