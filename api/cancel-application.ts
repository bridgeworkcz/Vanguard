import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findSheetRowById, updateSheetRowById } from '../server/utils/sheets.js';
import { mapApplicationToRow, mapRowToApplication } from '../server/utils/mappers.js';
import { authenticateRequest, isStaff } from '../server/utils/permissions.js';
import { recordSafeAuditLog } from '../server/utils/audit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = authenticateRequest(req.headers.authorization);
    if (!auth.authorized || !auth.session) return res.status(auth.statusCode).json({ error: auth.errorMessage });
    const id = String(req.body?.applicationId || '').trim();
    if (!id) return res.status(400).json({ error: 'Application id is required.' });
    const row = await findSheetRowById('Applications', id);
    if (!row) return res.status(404).json({ error: 'Application not found.' });
    const app = mapRowToApplication(row);
    const staff = isStaff(auth.session);
    if (!staff && app.userId !== auth.session.userId) return res.status(403).json({ error: 'Forbidden.' });
    if (app.status === 'CANCELLED') return res.status(200).json({ application: app });
    if (!staff && app.stage > 2) return res.status(409).json({ error: 'This application can no longer be cancelled by the client. Contact the desk.' });
    const updated = {
      ...app,
      status: 'CANCELLED' as const,
      rejectedReason: String(req.body?.reason || 'Cancelled by client').trim(),
      updatedAt: new Date().toISOString()
    };
    await updateSheetRowById('Applications', id, mapApplicationToRow(updated));
    await recordSafeAuditLog({ actorUserId: auth.session.userId, action: 'APPLICATION_CANCEL', targetEntity: 'APPLICATION', targetEntityId: id, details: updated.rejectedReason });
    return res.status(200).json({ application: updated });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal Server Error' });
  }
}
