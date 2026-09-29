import { Role } from '../../src/types.js';
import { extractBearerToken, verifySessionToken, AuthSessionPayload } from './auth.js';

export interface AuthCheckResult {
  authorized: boolean;
  statusCode: number;
  errorMessage?: string;
  session?: AuthSessionPayload;
}

/**
 * Валідує HTTP-заголовок Authorization та повертає сесію залогіненого користувача.
 */
export function authenticateRequest(authHeader: string | undefined): AuthCheckResult {
  const token = extractBearerToken(authHeader);
  if (!token) {
    return {
      authorized: false,
      statusCode: 401,
      errorMessage: 'Authentication Error: Missing or invalid Authorization header.',
    };
  }

  const session = verifySessionToken(token);
  if (!session) {
    return {
      authorized: false,
      statusCode: 401,
      errorMessage: 'Authentication Error: Session token is expired or invalid.',
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    session,
  };
}

/**
 * Перевіряє, чи має користувач хоча б одну з необхідних ролей.
 */
export function hasRole(session: AuthSessionPayload, allowedRoles: Role[]): boolean {
  if (!session || !Array.isArray(session.roles)) {
    return false;
  }
  return session.roles.some(role => allowedRoles.includes(role));
}

/**
 * Перевіряє, чи є користувач адміністратором або менеджером.
 */
export function isStaff(session: AuthSessionPayload): boolean {
  return hasRole(session, ['ADMIN', 'MANAGER']);
}

/**
 * Перевіряє право власності на ресурс (Ownership Check).
 * Доступ дозволено, якщо:
 * 1. Користувач є власником ресурсу (session.userId === targetUserId);
 * 2. Користувач має роль ADMIN або MANAGER.
 */
export function validateOwnership(
  session: AuthSessionPayload,
  targetUserId: string
): AuthCheckResult {
  if (!session) {
    return {
      authorized: false,
      statusCode: 401,
      errorMessage: 'Authentication Error: Session missing.',
    };
  }

  const cleanTargetUserId = targetUserId ? targetUserId.trim() : '';
  if (!cleanTargetUserId) {
    return {
      authorized: false,
      statusCode: 400,
      errorMessage: 'Validation Error: Target userId parameter is missing.',
    };
  }

  // Перевірка 1: Staff Access (ADMIN / MANAGER)
  if (isStaff(session)) {
    return { authorized: true, statusCode: 200, session };
  }

  // Перевірка 2: Resource Owner Access
  if (session.userId === cleanTargetUserId) {
    return { authorized: true, statusCode: 200, session };
  }

  return {
    authorized: false,
    statusCode: 403,
    errorMessage: 'Forbidden Error: You do not have permission to access or modify this resource.',
  };
}

/**
 * Валідує авторизацію та мінімально необхідну роль за один виклик.
 */
export function authorizeRole(
  authHeader: string | undefined,
  requiredRoles: Role[]
): AuthCheckResult {
  const authResult = authenticateRequest(authHeader);
  if (!authResult.authorized || !authResult.session) {
    return authResult;
  }

  if (!hasRole(authResult.session, requiredRoles)) {
    return {
      authorized: false,
      statusCode: 403,
      errorMessage: `Forbidden Error: Required role [${requiredRoles.join(', ')}] missing.`,
      session: authResult.session,
    };
  }

  return authResult;
}
