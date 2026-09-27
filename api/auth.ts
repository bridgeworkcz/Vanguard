import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSheetRows, appendSheetRow } from '../server/utils/sheets';
import { hashPassword, verifyPassword, generateSessionToken } from '../server/utils/auth';
import { userFromRow, userToRow } from '../server/utils/mappers';
import { sendTelegramAlert } from '../server/utils/telegram';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
      }

      const token = authHeader.substring(7);
      const secret = process.env.SESSION_SECRET || 'fallback-secret';
      
      const { verifySessionToken } = await import('../server/utils/auth');
      const payload = verifySessionToken(token, secret);
      
      if (!payload) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }

      return res.status(200).json({ user: payload.user });
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
      const existingUsers = rawRows.map(userFromRow);
      
      const exists = existingUsers.some(u => u.email.toLowerCase() === normalizedEmail);
      if (exists) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      const userId = `USR-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();

      const newUser = {
        id: userId,
        email: normalizedEmail,
        phone: String(phone).trim(),
        fullName: String(fullName).trim(),
        roles: ['CLIENT'],
        createdAt: now,
        lastLoginAt: now,
      };

      const rowData = userToRow(newUser, passwordHash);
      await appendSheetRow('Users', rowData);

      const secret = process.env.SESSION_SECRET || 'fallback-secret';
      const token = generateSessionToken(newUser, secret);

      await sendTelegramAlert(`🆕 <b>Нова реєстрація клієнта</b>\n\n👤 Ім'я: ${newUser.fullName}\n📧 Email: ${newUser.email}\n📞 Тел: ${newUser.phone}`);

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

      const user = userFromRow(foundRow);
      const secret = process.env.SESSION_SECRET || 'fallback-secret';
      const token = generateSessionToken(user, secret);

      return res.status(200).json({ token, user });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err: any) {
    console.error('Server Auth Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
