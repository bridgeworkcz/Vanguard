import type {
  User,
  UserRecord,
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
} from '../../src/types.js';

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

// --- 1. User Mapper ---

export function mapRowToUserRecord(record: Record<string, string>): UserRecord {
  return {
    id: requireString(record.id, 'id'),
    email: requireString(record.email, 'email'),
    phone: requireString(record.phone, 'phone'),
    fullName: requireString(record.fullName, 'fullName'),
    roles: parseRoles(record.roles),
    passwordHash: requireString(record.passwordHash, 'passwordHash'),
    createdAt: requireString(record.createdAt, 'createdAt'),
    lastLoginAt: record.lastLoginAt ? safeString(record.lastLoginAt) : undefined,
    isActive: record.isActive === '' || record.isActive === undefined ? true : requireBoolean(record.isActive, 'isActive'),
  };
}

export function mapRowToUser(record: Record<string, string>): User {
  const user = mapRowToUserRecord(record);
  const { passwordHash: _passwordHash, isActive: _isActive, ...publicUser } = user;
  return publicUser;
}

export function mapUserToRow(user: UserRecord): Record<string, string> {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    roles: JSON.stringify(user.roles),
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || '',
    isActive: String(user.isActive),
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
    tranchePercent: (Number(record.tranchePercent)===40?40:30),
    status: parsePaymentReviewStatus(record.status),
    submittedAt: requireString(record.submittedAt, 'submittedAt'),
    verifiedAt: record.verifiedAt ? safeString(record.verifiedAt) : undefined,
    verifiedBy: record.verifiedBy ? safeString(record.verifiedBy) : undefined,
    proofFileId: record.proofFileId ? safeString(record.proofFileId) : undefined,
    proofFileName: record.proofFileName ? safeString(record.proofFileName) : undefined,
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
    proofFileId: payment.proofFileId || '',
    proofFileName: payment.proofFileName || '',
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
export function mapRowToVacancy(record: Record<string,string>): Vacancy {
  return { id:requireString(record.id,'id'), title:requireString(record.title,'title'), category:requireString(record.category,'category'), country:requireString(record.country,'country'), salaryNet:safeString(record.salaryNet), salaryGross:safeString(record.salaryGross), accommodation:safeString(record.accommodation), workingHours:safeString(record.workingHours), description:safeString(record.description), quotaRemaining:requireNumber(record.quotaRemaining,'quotaRemaining'), isActive:record.isActive===''?true:requireBoolean(record.isActive,'isActive'), visaProductId:record.visaProductId?safeString(record.visaProductId):undefined, visaDuration:record.visaDuration?safeString(record.visaDuration):undefined, processingOptions:record.processingOptions?JSON.parse(record.processingOptions):undefined, employerLabel:record.employerLabel?safeString(record.employerLabel):undefined, requirements:record.requirements?safeString(record.requirements):undefined, createdAt:record.createdAt?safeString(record.createdAt):undefined, updatedAt:record.updatedAt?safeString(record.updatedAt):undefined };
}
export function mapVacancyToRow(v: Vacancy): Record<string,string> { return {id:v.id,title:v.title,category:v.category,country:v.country,salaryNet:v.salaryNet,salaryGross:v.salaryGross,accommodation:v.accommodation,workingHours:v.workingHours,description:v.description,quotaRemaining:String(v.quotaRemaining),isActive:String(v.isActive),visaProductId:v.visaProductId||'',visaDuration:v.visaDuration||'',processingOptions:JSON.stringify(v.processingOptions||[]),employerLabel:v.employerLabel||'',requirements:v.requirements||'',createdAt:v.createdAt||'',updatedAt:v.updatedAt||''}; }

// --- 6. TeamMember Mapper ---
export function mapRowToTeamMember(record: Record<string,string>): TeamMember { return {id:requireString(record.id,'id'),fullName:requireString(record.fullName,'fullName'),position:requireString(record.position,'position'),photoUrl:safeString(record.photoUrl),contactPhone:record.contactPhone?safeString(record.contactPhone):undefined,languages:safeArrayString(record.languages),bio:safeString(record.bio),order:requireNumber(record.order,'order'),isActive:record.isActive===''?true:requireBoolean(record.isActive,'isActive')}; }
export function mapTeamMemberToRow(m:TeamMember):Record<string,string>{return{id:m.id,fullName:m.fullName,position:m.position,photoUrl:m.photoUrl,contactPhone:m.contactPhone||'',languages:JSON.stringify(m.languages),bio:m.bio,order:String(m.order),isActive:String(m.isActive!==false)}}

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


export function mapRowToApplication(record: Record<string,string>): import('../../src/types.js').Application {
 const status=requireString(record.status,'status') as import('../../src/types.js').ApplicationStatus; const allowed=['SUBMITTED','APPROVED','PROCESSING','FINAL_PAYMENT','REJECTED','CANCELLED']; if(!allowed.includes(status))throw new Error(`Invalid application status '${status}'`);
 const stage=Number(record.stage||1) as import('../../src/types.js').ApplicationStage; if(![1,2,3,4].includes(stage))throw new Error(`Invalid application stage '${record.stage}'`);
 return {id:requireString(record.id,'id'),userId:requireString(record.userId,'userId'),vacancyId:requireString(record.vacancyId,'vacancyId'),applicantData:safeString(record.applicantData),status,stage,visaProductId:record.visaProductId?safeString(record.visaProductId):undefined,country:record.country?safeString(record.country):undefined,processingOption:record.processingOption as any,totalCost:requireNumber(record.totalCost||'0','totalCost'),currency:safeString(record.currency||'EUR'),processStage:record.processStage as any,paymentDeadlineAt:record.paymentDeadlineAt?safeString(record.paymentDeadlineAt):undefined,documentDeadlineAt:record.documentDeadlineAt?safeString(record.documentDeadlineAt):undefined,assignedManagerId:record.assignedManagerId?safeString(record.assignedManagerId):undefined,createdAt:requireString(record.createdAt,'createdAt'),updatedAt:requireString(record.updatedAt,'updatedAt'),approvedAt:record.approvedAt?safeString(record.approvedAt):undefined,rejectedReason:record.rejectedReason?safeString(record.rejectedReason):undefined};
}
export function mapApplicationToRow(a: import('../../src/types.js').Application): Record<string,string> { return {id:a.id,userId:a.userId,vacancyId:a.vacancyId,applicantData:a.applicantData,status:a.status,stage:String(a.stage),visaProductId:a.visaProductId||'',country:a.country||'',processingOption:a.processingOption||'',totalCost:String(a.totalCost),currency:a.currency,processStage:a.processStage||'',paymentDeadlineAt:a.paymentDeadlineAt||'',documentDeadlineAt:a.documentDeadlineAt||'',assignedManagerId:a.assignedManagerId||'',createdAt:a.createdAt,updatedAt:a.updatedAt,approvedAt:a.approvedAt||'',rejectedReason:a.rejectedReason||''}; }
export function mapRowToPricing(record: Record<string,string>): import('../../src/types.js').PricingItem {
  return { id:requireString(record.id,'id'), name:requireString(record.name,'name'), description:safeString(record.description), amount:requireNumber(record.amount,'amount'), currency:requireString(record.currency,'currency'), active:requireBoolean(record.active,'active'), updatedAt:requireString(record.updatedAt,'updatedAt'), updatedBy:requireString(record.updatedBy,'updatedBy') };
}
export function mapPricingToRow(x: import('../../src/types.js').PricingItem): Record<string,string> {
  return { id:x.id,name:x.name,description:x.description,amount:String(x.amount),currency:x.currency,active:String(x.active),updatedAt:x.updatedAt,updatedBy:x.updatedBy };
}
export function mapRowToSetting(record: Record<string,string>): import('../../src/types.js').SystemSetting {
  return { id:requireString(record.id,'id'),key:requireString(record.key,'key'),value:safeString(record.value),updatedAt:requireString(record.updatedAt,'updatedAt'),updatedBy:requireString(record.updatedBy,'updatedBy') };
}
export function mapSettingToRow(x: import('../../src/types.js').SystemSetting): Record<string,string> {
  return { id:x.id,key:x.key,value:x.value,updatedAt:x.updatedAt,updatedBy:x.updatedBy };
}
export function mapRowToGallery(record: Record<string,string>): import('../../src/types.js').GalleryItem {
  return { id:requireString(record.id,'id'),title:requireString(record.title,'title'),imageUrl:requireString(record.imageUrl,'imageUrl'),caption:safeString(record.caption),order:requireNumber(record.order,'order'),isActive:requireBoolean(record.isActive,'isActive') };
}
export function mapGalleryToRow(x: import('../../src/types.js').GalleryItem): Record<string,string> {
  return { id:x.id,title:x.title,imageUrl:x.imageUrl,caption:x.caption,order:String(x.order),isActive:String(x.isActive) };
}
export function mapRowToSupportTicket(record: Record<string,string>): import('../../src/types.js').SupportTicket {
  const status = requireString(record.status,'status') as import('../../src/types.js').SupportTicketStatus;
  const allowed = ['OPEN','IN_PROGRESS','RESOLVED','CLOSED'];
  if (!allowed.includes(status)) throw new Error(`Validation Error: Invalid support ticket status '${status}'`);
  return { id:requireString(record.id,'id'),userId:requireString(record.userId,'userId'),dossierId:record.dossierId?safeString(record.dossierId):undefined,subject:requireString(record.subject,'subject'),message:requireString(record.message,'message'),status,assignedManagerId:record.assignedManagerId?safeString(record.assignedManagerId):undefined,createdAt:requireString(record.createdAt,'createdAt'),updatedAt:requireString(record.updatedAt,'updatedAt') };
}
export function mapSupportTicketToRow(x: import('../../src/types.js').SupportTicket): Record<string,string> {
  return { id:x.id,userId:x.userId,dossierId:x.dossierId||'',subject:x.subject,message:x.message,status:x.status,assignedManagerId:x.assignedManagerId||'',createdAt:x.createdAt,updatedAt:x.updatedAt };
}
export function mapRowToBackup(record: Record<string,string>): import('../../src/types.js').BackupRecord {
  return { id:requireString(record.id,'id'),createdBy:requireString(record.createdBy,'createdBy'),driveFileId:requireString(record.driveFileId,'driveFileId'),fileName:requireString(record.fileName,'fileName'),createdAt:requireString(record.createdAt,'createdAt') };
}
export function mapBackupToRow(x: import('../../src/types.js').BackupRecord): Record<string,string> {
  return { id:x.id,createdBy:x.createdBy,driveFileId:x.driveFileId,fileName:x.fileName,createdAt:x.createdAt };
}
