import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSheetRows, appendSheetRow, updateSheetRowById } from '../server/utils/sheets.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../server/utils/auth.js';
import { mapRowToUser, mapRowToUserRecord, mapUserToRow } from '../server/utils/mappers.js';
import { sendSafeTelegramAlert } from '../server/utils/telegram.js';
import type { Role, User, UserRecord } from '../src/types.js';

const OWNER_EMAIL = 'admin@gmail.com';

function normalizeEmail(value: unknown): string { return String(value ?? '').trim().toLowerCase(); }
function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const plus = raw.startsWith('+') ? '+' : '';
  return plus + raw.replace(/\D/g, '');
}

function withOwnerRole(record: UserRecord): UserRecord {
  if (normalizeEmail(record.email) !== OWNER_EMAIL) return record;
  const roles = Array.from(new Set([...(record.roles || []), 'ADMIN', 'MANAGER'])) as Role[];
  return { ...record, roles };
}

function publicUser(record: UserRecord): User {
  return mapRowToUser(record as unknown as Record<string, string>);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized: Missing token' });
      const payload = verifySessionToken(authHeader.slice(7));
      if (!payload) return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });

      const rows = await readSheetRows('Users');
      const record = rows.find(row => row.id === payload.userId);
      if (!record) return res.status(401).json({ error: 'Unauthorized: User no longer exists' });
      const userRecord = withOwnerRole(mapRowToUserRecord(record));
      if (!userRecord.isActive) return res.status(403).json({ error: 'Account is inactive' });
      return res.status(200).json({ user: publicUser(userRecord) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, email, phone, password, fullName } = req.body || {};
    if (!action || !password) return res.status(400).json({ error: 'Action and password are required' });

    const rows = await readSheetRows('Users');

    if (action === 'register') {
      const normalizedEmail = normalizeEmail(email);
      const normalizedPhone = normalizePhone(phone);
      const cleanName = String(fullName ?? '').trim();
      if (!normalizedEmail || !normalizedEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
      if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'A valid phone number is required' });
      if (!cleanName) return res.status(400).json({ error: 'Full name is required' });
      if (String(password).trim().length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long' });

      for (const row of rows) {
        const rowEmail = normalizeEmail(row.email);
        const rowPhone = normalizePhone(row.phone);
        if (rowEmail === normalizedEmail) return res.status(409).json({ error: 'User with this email already exists' });
        if (rowPhone && rowPhone === normalizedPhone) return res.status(409).json({ error: 'User with this phone already exists' });
      }

      const userId = `USR-${cryptoRandomId()}`;
      const now = new Date().toISOString();
      const userRecord = withOwnerRole({
        id: userId,
        email: normalizedEmail,
        phone: normalizedPhone,
        fullName: cleanName,
        roles: normalizedEmail === OWNER_EMAIL ? ['ADMIN', 'MANAGER'] : ['CLIENT'],
        passwordHash: hashPassword(String(password)),
        createdAt: now,
        lastLoginAt: now,
        isActive: true,
      });

      await appendSheetRow('Users', mapUserToRow(userRecord));
      const user = publicUser(userRecord);
      const token = createSessionToken({ userId: user.id, email: user.email, roles: user.roles });

      try {
        await sendSafeTelegramAlert(`New registration\n${user.fullName}\n${user.email}`);
      } catch (telegramError) {
        console.warn('Registration Telegram notification failed:', telegramError);
      }
      return res.status(201).json({ token, user });
    }

    if (action === 'login') {
      const identifier = String(email ?? phone ?? '').trim();
      if (!identifier) return res.status(400).json({ error: 'Email or phone is required' });
      const normalizedEmail = normalizeEmail(identifier);
      const normalizedPhone = normalizePhone(identifier);
      const record = rows.find(row => normalizeEmail(row.email) === normalizedEmail || normalizePhone(row.phone) === normalizedPhone);
      if (!record) return res.status(401).json({ error: 'Invalid email/phone or password' });

      const userRecord = withOwnerRole(mapRowToUserRecord(record));
      if (!userRecord.isActive) return res.status(403).json({ error: 'Account is inactive' });
      if (!verifyPassword(String(password), userRecord.passwordHash)) return res.status(401).json({ error: 'Invalid email/phone or password' });

      const lastLoginAt = new Date().toISOString();
      await updateSheetRowById('Users', userRecord.id, mapUserToRow({ ...userRecord, lastLoginAt }));
      const user = { ...publicUser(userRecord), lastLoginAt };
      const token = createSessionToken({ userId: user.id, email: user.email, roles: user.roles });
      return res.status(200).json({ token, user });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err: unknown) {
    console.error('Server Auth Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
  }
}

function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
}
