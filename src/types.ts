export type Role = 'CLIENT' | 'MANAGER' | 'ADMIN';

export type ProcessStatus =
  | 'NEW' | 'DOCUMENTS_REQUIRED' | 'DOCUMENTS_REVIEW' | 'LEGAL_REVIEW'
  | 'READY_FOR_FILING' | 'FILED' | 'PROCESSING' | 'APPROVED'
  | 'COMPLETED' | 'REJECTED' | 'ON_HOLD' | 'CANCELLED';

export type DossierPaymentStatus = 'NOT_DUE' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
export type PaymentReviewStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED' | 'REFUNDED';
export type DocumentStatus = 'MISSING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
export type DocumentCategory = 'PASSPORT' | 'POLICE_CLEARANCE' | 'EDUCATION_DIPLOMA' | 'MEDICAL_CLEARANCE' | 'CONTRACT';
export type ApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'REJECTED' | 'ACCEPTED' | 'WITHDRAWN';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface User { id:string; email:string; phone:string; fullName:string; roles:Role[]; createdAt:string; lastLoginAt?:string; }
export interface UserRecord extends User { passwordHash:string; isActive:boolean; }
export interface Dossier {
  id:string; userId:string; fullName:string; passportNumber:string; citizenship:string;
  targetCountry:string; vacancyId?:string; vacancyTitle?:string; processStatus:ProcessStatus;
  paymentStatus:DossierPaymentStatus; currency:string; totalCost:number; paidAmount:number;
  remainingAmount:number; assignedManagerId?:string; createdAt:string; updatedAt:string;
}
export interface PaymentTransaction {
  id:string; dossierId:string; userId:string; amount:number; currency:string; network:string;
  txHash:string; tranchePercent:20|50|30; status:PaymentReviewStatus; submittedAt:string;
  verifiedAt?:string; verifiedBy?:string;
}
export interface DossierDocument {
  id:string; dossierId:string; category:DocumentCategory; fileName:string; driveFileId?:string;
  status:DocumentStatus; uploadedAt:string; reviewedAt?:string; reviewedBy?:string; rejectionReason?:string;
}
export interface Vacancy {
  id:string; title:string; category:string; country:string; salaryNet:string; salaryGross:string;
  accommodation:string; workingHours:string; description:string; quotaRemaining:number; isActive:boolean;
}
export interface TeamMember { id:string; fullName:string; position:string; photoUrl:string; languages:string[]; bio:string; order:number; }
export interface Application {
  id:string; userId:string; vacancyId:string; applicantData:string; status:ApplicationStatus;
  assignedManagerId?:string; createdAt:string; updatedAt:string;
}
export interface AuditLogEntry { id:string; actorUserId:string; action:string; targetEntity:string; targetEntityId:string; details?:string; timestamp:string; }
export interface PricingItem { id:string; name:string; description:string; amount:number; currency:string; active:boolean; updatedAt:string; updatedBy:string; }
export interface SystemSetting { id:string; key:string; value:string; updatedAt:string; updatedBy:string; }
export interface GalleryItem { id:string; title:string; imageUrl:string; caption:string; order:number; isActive:boolean; }
export interface SupportTicket { id:string; userId:string; dossierId?:string; subject:string; message:string; status:SupportTicketStatus; assignedManagerId?:string; createdAt:string; updatedAt:string; }
export interface BackupRecord { id:string; createdBy:string; driveFileId:string; fileName:string; createdAt:string; }
