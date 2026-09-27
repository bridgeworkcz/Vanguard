import crypto from 'crypto';
import { Role } from '../../src/types';

export interface AuthSessionPayload {
  userId: string;
  email: string;
  roles: Role[];
  iat: number;
  exp: number;
}

// --- 1. Отримання та валідація секрету сесії з process.env ---

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ? process.env.SESSION_SECRET.trim() : '';
  if (!secret) {
    throw new Error(
      'Server Config Error: Missing required SESSION_SECRET environment variable for token signing.'
    );
  }
  return secret;
}

// --- 2. Криптографічно стійке хешування паролів (PBKDF2-SHA512) ---

/**
 * Генерує солінований хеш пароля за стандартом PBKDF2-SHA512.
 * Формат виходу: "saltHex:hashHex"
 */
export function hashPassword(password: string): string {
  const cleanPassword = password ? password.trim() : '';
  if (!cleanPassword || cleanPassword.length < 8) {
    throw new Error('Auth Error: Password must be at least 8 characters long.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(cleanPassword, salt, 100000, 64, 'sha512')
    .toString('hex');

  return `${salt}:${hash}`;
}

/**
 * Валідує введений пароль проти збереженого PBKDF2 хешу з захистом від Timing Attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const cleanPassword = password ? password.trim() : '';
  const cleanStoredHash = storedHash ? storedHash.trim() : '';

  if (!cleanPassword || !cleanStoredHash) {
    return false;
  }

  const parts = cleanStoredHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [salt, originalHash] = parts;
  if (!salt || !originalHash) {
    return false;
  }

  try {
    const computedHashBuffer = crypto.pbkdf2Sync(cleanPassword, salt, 100000, 64, 'sha512');
    const originalHashBuffer = Buffer.from(originalHash, 'hex');

    if (computedHashBuffer.length !== originalHashBuffer.length) {
      return false;
    }

    // Захист від атаки по часу через timingSafeEqual
    return crypto.timingSafeEqual(computedHashBuffer, originalHashBuffer);
  } catch {
    return false;
  }
}

// --- 3. Генерація та перевірка HMAC-SHA256 Сесійних Токенів ---

/**
 * Створює криптографічно підписаний сесійний JWT-токен (за замовчуванням дійсний 24 години).
 */
export function createSessionToken(
  payload: { userId: string; email: string; roles: Role[] },
  expiresInSeconds = 86400
): string {
  const secret = getSessionSecret();
  const now = Math.floor(Date.now() / 1000);

  const tokenPayload: AuthSessionPayload = {
    userId: payload.userId,
    email: payload.email,
    roles: payload.roles,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };

  const base64UrlEncode = (obj: object): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(tokenPayload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signatureInput}.${signature}`;
}

/**
 * Перевіряє підпис, термін дії та структуру сесійного токена.
 * Повертає декодований AuthSessionPayload або null, якщо токен недійсний чи прострочений.
 */
export function verifySessionToken(token: string): AuthSessionPayload | null {
  const cleanToken = token ? token.trim() : '';
  if (!cleanToken) {
    return null;
  }

  const parts = cleanToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !providedSignature) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedSignatureBuffer = Buffer.from(providedSignature, 'utf8');

    if (expectedSignatureBuffer.length !== providedSignatureBuffer.length) {
      return null;
    }

    // Захист від підробки підпису через timingSafeEqual
    if (!crypto.timingSafeEqual(expectedSignatureBuffer, providedSignatureBuffer)) {
      return null;
    }

    // Декодування Payload
    const base64Payload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonString = Buffer.from(base64Payload, 'base64').toString('utf8');
    const payload = JSON.parse(jsonString) as AuthSessionPayload;

    // Перевірка терміну дії (exp)
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return null;
    }

    if (!payload.userId || !payload.email || !Array.isArray(payload.roles)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// --- 4. Допоміжні хелпери витягування токена з HTTP-запитів ---

/**
 * Витягує токен з заголовока Authorization: Bearer <token>
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const cleanHeader = authHeader.trim();
  if (!cleanHeader.startsWith('Bearer ')) return null;
  const token = cleanHeader.substring(7).trim();
  return token || null;
}
