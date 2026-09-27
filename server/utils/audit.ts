import { AuditLogEntry } from '../../src/types';
import { mapAuditLogToRow } from './mappers';
import { appendSheetRow } from './sheets';

export interface RecordAuditParams {
  actorUserId: string;
  action: string;
  targetEntity: string;
  targetEntityId: string;
  details?: string;
}

const AUDIT_SHEET_NAME = 'AuditLog';

/**
 * Створює новий запис аудиту та зберігає його в аркуш AuditLog у Google Sheets.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<AuditLogEntry> {
  const cleanActor = params.actorUserId ? params.actorUserId.trim() : 'SYSTEM';
  const cleanAction = params.action ? params.action.trim() : '';
  const cleanEntity = params.targetEntity ? params.targetEntity.trim() : 'UNKNOWN';
  const cleanEntityId = params.targetEntityId ? params.targetEntityId.trim() : '';

  if (!cleanAction) {
    throw new Error('Audit Error: Action parameter is required.');
  }

  if (!cleanEntityId) {
    throw new Error('Audit Error: TargetEntityId parameter is required.');
  }

  const logId = `LOG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const timestamp = new Date().toISOString();

  const entry: AuditLogEntry = {
    id: logId,
    actorUserId: cleanActor,
    action: cleanAction,
    targetEntity: cleanEntity,
    targetEntityId: cleanEntityId,
    details: params.details ? params.details.trim() : undefined,
    timestamp,
  };

  const rowData = mapAuditLogToRow(entry);
  await appendSheetRow(AUDIT_SHEET_NAME, rowData);

  return entry;
}

/**
 * Безаварійна обгортка запису аудиту (Safe Non-Blocking Audit).
 * Якщо збереження в Google Sheets падає, логується попередження, але основна бізнес-транзакція не переривається.
 */
export async function recordSafeAuditLog(params: RecordAuditParams): Promise<AuditLogEntry | null> {
  try {
    return await recordAuditLog(params);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[Audit Log Warning]: Non-blocking audit recording skipped due to error:', msg);
    return null;
  }
}
