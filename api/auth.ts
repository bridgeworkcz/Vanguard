import type { VercelRequest, VercelResponse } from '@vercel/node';
import { User } from '../src/types';
import { mapRowToUser, mapUserToRow } from '../server/utils/mappers';
import { readSheetRows, appendSheetRow, findSheetRowById } from '../server/utils/sheets';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  extractBearerToken
} from '../server/utils/auth';
import { recordSafeAuditLog } from '../server/utils/audit';

const USERS_SHEET_NAME = 'Users';

// --- 1. Обробник входу (Login Handler) ---

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const { email, password } = req.body || {};

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanPassword = password ? String(password).trim() : '';

  if (!cleanEmail || !cleanPassword) {
    return res.status(400).json({
      error: 'Validation Error: Email and password are required.'
    });
  }

  // Зчитуємо користувачів із Google Sheets
  const rows = await readSheetRows(USERS_SHEET_NAME);
  const targetRow = rows.find(r => String(r.email || '').trim().toLowerCase() === cleanEmail);

  if (!targetRow) {
    return res.status(401).json({
      error: 'Authentication Error: Invalid email or password.'
    });
  }

  const storedPasswordHash = String(targetRow.passwordHash || '').trim();
  if (!storedPasswordHash) {
    return res.status(401).json({
      error: 'Authentication Error: Invalid account setup. Please contact support.'
    });
  }

  // Криптографічна перевірка PBKDF2-SHA512 хешу з захистом від Timing Attacks
  const isValidPassword = verifyPassword(cleanPassword, storedPasswordHash);
  if (!isValidPassword) {
    return res.status(401).json({
      error: 'Authentication Error: Invalid email or password.'
    });
  }

  // Трансляція рядка базі даних у типізований об'єкт User
  const user = mapRowToUser(targetRow);

  // Генерація підписаного HMAC-SHA256 сесійного токена
  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    roles: user.roles,
  });

  // Запис в Audit Log
  await recordSafeAuditLog({
    actorUserId: user.id,
    action: 'USER_LOGIN',
    targetEntity: 'USER',
    targetEntityId: user.id,
    details: `Successful login for email: ${user.email}`
  });

  return res.status(200).json({
    token,
    user,
  });
}

// --- 2. Обробник реєстрації (Register Handler) ---

async function handleRegister(req: VercelRequest, res: VercelResponse) {
  const { email, password, fullName, phone } = req.body || {};

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanPassword = password ? String(password).trim() : '';
  const cleanFullName = fullName ? String(fullName).trim() : '';
  const cleanPhone = phone ? String(phone).trim() : '';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({
      error: 'Validation Error: A valid email address is required.'
    });
  }

  if (!cleanPassword || cleanPassword.length < 8) {
    return res.status(400).json({
      error: 'Validation Error: Password must be at least 8 characters long.'
    });
  }

  if (!cleanFullName) {
    return res.status(400).json({
      error: 'Validation Error: Full name is required.'
    });
  }

  if (!cleanPhone) {
    return res.status(400).json({
      error: 'Validation Error: Phone number is required.'
    });
  }

  // Перевірка на існування дублікату Email
  const existingRows = await readSheetRows(USERS_SHEET_NAME);
  const duplicate = existingRows.find(
    r => String(r.email || '').trim().toLowerCase() === cleanEmail
  );

  if (duplicate) {
    return res.status(400).json({
      error: 'Registration Error: An account with this email already exists.'
    });
  }

  // Формування нового ID та криптографічного хешу
  const userId = `USR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const passwordHash = hashPassword(cleanPassword);

  const newUser: User = {
    id: userId,
    email: cleanEmail,
    phone: cleanPhone,
    fullName: cleanFullName,
    roles: ['CLIENT'], // Публічна реєстрація призначає виключно роль CLIENT
    createdAt: new Date().toISOString(),
  };

  // Перетворення у формат Google Sheets + додання хешу
  const userRow = mapUserToRow(newUser);
  userRow.passwordHash = passwordHash;

  await appendSheetRow(USERS_SHEET_NAME, userRow);

  // Створення сесійного токена
  const token = createSessionToken({
    userId: newUser.id,
    email: newUser.email,
    roles: newUser.roles,
  });

  // Запис в Audit Log
  await recordSafeAuditLog({
    actorUserId: newUser.id,
    action: 'USER_REGISTER',
    targetEntity: 'USER',
    targetEntityId: newUser.id,
    details: `New client registration for email: ${newUser.email}`
  });

  return res.status(201).json({
    token,
    user: newUser,
  });
}

// --- 3. Обробник перевірки поточного профілю (Me Handler) ---

async function handleMe(req: VercelRequest, res: VercelResponse) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({
      error: 'Authentication Error: Missing Authorization header.'
    });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({
      error: 'Authentication Error: Session token is expired or invalid.'
    });
  }

  const targetRow = await findSheetRowById(USERS_SHEET_NAME, session.userId);
  if (!targetRow) {
    return res.status(404).json({
      error: 'User Error: User profile not found.'
    });
  }

  const user = mapRowToUser(targetRow);

  return res.status(200).json({ user });
}

// --- 4. Головна Serverless Точка Входу (Default Handler) ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();

    if (req.method === 'POST') {
      if (action === 'login') {
        return await handleLogin(req, res);
      }
      if (action === 'register') {
        return await handleRegister(req, res);
      }
      return res.status(400).json({
        error: `Invalid action parameter '${action}' for POST request. Allowed: 'login', 'register'.`
      });
    }

    if (req.method === 'GET') {
      if (action === 'me' || !action) {
        return await handleMe(req, res);
      }
      return res.status(400).json({
        error: `Invalid action parameter '${action}' for GET request. Allowed: 'me'.`
      });
    }

    return res.status(405).json({
      error: `HTTP Method '${req.method}' not allowed.`
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[API Auth Crash]:', errorMessage);

    return res.status(500).json({
      error: `Server Exception: ${errorMessage}`
    });
  }
}
