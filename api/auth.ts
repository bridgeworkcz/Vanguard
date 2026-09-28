import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSheetRows, appendSheetRow } from '../server/utils/sheets.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../server/utils/auth.js';
import { mapRowToUser, mapUserToRow } from '../server/utils/mappers.js';
import { sendSafeTelegramAlert } from '../server/utils/telegram.js';
import type { User } from '../src/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
      }

      const token = authHeader.substring(7);
      const payload = verifySessionToken(token);
      
      if (!payload) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }

      const user = (payload as any).user || {
        id: (payload as any).userId || (payload as any).id,
        email: (payload as any).email,
        phone: (payload as any).phone || '',
        fullName: (payload as any).fullName || '',
        roles: (payload as any).roles || ['CLIENT'],
        createdAt: (payload as any).createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      return res.status(200).json({ user });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, email, password, fullName, phone } = req.body || {};

    if (!action || !email || !password) {
      return res.status(400).json({ error: 'Action, email, and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (action === 'register') {
      if (!fullName || !phone) {
        return res.status(400).json({ error: 'Full name and phone are required for registration' });
      }

      const rawRows = await readSheetRows('Users');
      const existingUsers: User[] = rawRows.map((row) => mapRowToUser(row));
      
      const exists = existingUsers.some((u: User) => u.email.toLowerCase() === normalizedEmail);
      if (exists) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      const userId = `USR-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();

      const newUser: User = {
        id: userId,
        email: normalizedEmail,
        phone: String(phone).trim(),
        fullName: String(fullName).trim(),
        roles: ['CLIENT'],
        createdAt: now,
        lastLoginAt: now,
      };

      const rowData = mapUserToRow({ ...newUser, passwordHash } as any);
      await appendSheetRow('Users', rowData);

      const token = createSessionToken({
        userId: newUser.id,
        email: newUser.email,
        roles: newUser.roles,
      });

      try {
        await sendSafeTelegramAlert(
          `🆕 <b>Нова реєстрація клієнта</b>\n\n👤 Ім'я: ${newUser.fullName}\n📧 Email: ${newUser.email}\n📞 Тел: ${newUser.phone}`
        );
      } catch (tgErr) {
        console.error('Telegram alert warning:', tgErr);
      }

      return res.status(201).json({ token, user: newUser });
    }

    if (action === 'login') {
      const rawRows = await readSheetRows('Users');
      
      let foundRow: Record<string, string> | null = null;
      for (const row of rawRows) {
        if (row.email && String(row.email).trim().toLowerCase() === normalizedEmail) {
          foundRow = row;
          break;
        }
      }

      if (!foundRow || !foundRow.passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isValid = await verifyPassword(password, foundRow.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = mapRowToUser(foundRow);

      const token = createSessionToken({
        userId: user.id,
        email: user.email,
        roles: user.roles,
      });

      return res.status(200).json({ token, user });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err: any) {
    console.error('Server Auth Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
