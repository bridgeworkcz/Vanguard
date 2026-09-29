import crypto from 'crypto';

export const SHEET_SCHEMAS = {
  Users: ['id', 'email', 'phone', 'fullName', 'roles', 'passwordHash', 'createdAt', 'lastLoginAt', 'isActive'],
  Dossiers: ['id', 'userId', 'fullName', 'passportNumber', 'citizenship', 'targetCountry', 'vacancyId', 'vacancyTitle', 'processStatus', 'paymentStatus', 'currency', 'totalCost', 'paidAmount', 'remainingAmount', 'assignedManagerId', 'createdAt', 'updatedAt'],
  DossierDocuments: ['id', 'dossierId', 'category', 'fileName', 'driveFileId', 'status', 'uploadedAt', 'reviewedAt', 'reviewedBy', 'rejectionReason'],
  PaymentTransactions: ['id', 'dossierId', 'userId', 'amount', 'currency', 'network', 'txHash', 'tranchePercent', 'status', 'submittedAt', 'verifiedAt', 'verifiedBy'],
  Vacancies: ['id', 'title', 'category', 'country', 'salaryNet', 'salaryGross', 'accommodation', 'workingHours', 'description', 'quotaRemaining', 'isActive', 'createdAt', 'updatedAt'],
  Team: ['id', 'fullName', 'position', 'photoUrl', 'languages', 'bio', 'order', 'isActive'],
  AuditLog: ['id', 'actorUserId', 'action', 'targetEntity', 'targetEntityId', 'details', 'timestamp'],
  Applications: ['id', 'userId', 'vacancyId', 'applicantData', 'status', 'assignedManagerId', 'createdAt', 'updatedAt'],
} as const;

type KnownSheet = keyof typeof SHEET_SCHEMAS;

function parsePrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return '';
  let key = rawKey.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  return key;
}

interface GoogleSheetsCredentials { clientEmail: string; privateKey: string; spreadsheetId: string; }
interface CachedToken { token: string; expiresAt: number; }
let cachedAccessToken: CachedToken | null = null;

function getCredentials(): GoogleSheetsCredentials {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = parsePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  if (!clientEmail || !privateKey || !spreadsheetId) throw new Error('Server Config Error: Missing Google Sheets credentials.');
  return { clientEmail, privateKey, spreadsheetId };
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) return cachedAccessToken.token;
  const creds = getCredentials();
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const claims = enc({ iss: creds.clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
  const input = `${header}.${claims}`;
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(creds.privateKey, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${signature}` }),
  });
  if (!response.ok) throw new Error(`Google Auth Token Rejected (${response.status}).`);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google Auth Token response did not contain access_token.');
  cachedAccessToken = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return data.access_token;
}

async function sheetsApiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const creds = getCredentials();
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${creds.spreadsheetId}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API Error (${response.status}): ${body.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

function assertKnownSheet(sheetName: string): KnownSheet {
  if (!(sheetName in SHEET_SCHEMAS)) throw new Error(`Google Sheets Schema Error: Unknown sheet '${sheetName}'.`);
  return sheetName as KnownSheet;
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function columnLetter(indexZeroBased: number): string {
  let n = indexZeroBased + 1;
  let out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

function schemaFor(sheetName: string): readonly string[] {
  return SHEET_SCHEMAS[assertKnownSheet(sheetName)];
}

function validateHeaders(actual: string[], expected: readonly string[], sheetName: string): void {
  const normalized = actual.map(v => String(v ?? '').trim());
  if (normalized.length !== expected.length || normalized.some((h, i) => h !== expected[i])) {
    throw new Error(`Google Sheets Schema Error: Sheet '${sheetName}' headers do not match canonical schema. Expected: ${expected.join(', ')}. Actual: ${normalized.join(', ')}.`);
  }
}

async function getRawValues(sheetName: string): Promise<string[][]> {
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A:${columnLetter(schemaFor(sheetName).length - 1)}`);
  const data = await sheetsApiFetch<{ values?: string[][] }>(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
  return data.values || [];
}

async function ensureSchema(sheetName: string): Promise<string[]> {
  const expected = [...schemaFor(sheetName)];
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A:${columnLetter(expected.length - 1)}`);
  const data = await sheetsApiFetch<{ values?: string[][] }>(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
  const values = data.values || [];
  if (values.length === 0 || !values[0] || values[0].every(v => String(v ?? '').trim() === '')) {
    await sheetsApiFetch(`/values/${encodeURIComponent(`${quoteSheetName(sheetName)}!A1:${columnLetter(expected.length - 1)}1`)}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [expected] }),
    });
    return expected;
  }
  validateHeaders(values[0], expected, sheetName);
  return expected;
}

export async function readSheetRows(sheetName: string): Promise<Record<string, string>[]> {
  const headers = await ensureSchema(sheetName);
  const values = await getRawValues(sheetName);
  const rows = values.slice(1);
  return rows.map(row => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => { record[header] = row[i] === undefined || row[i] === null ? '' : String(row[i]).trim(); });
    return record;
  }).filter(record => Object.values(record).some(Boolean));
}

export async function findSheetRowById(sheetName: string, id: string): Promise<Record<string, string> | null> {
  const target = String(id).trim();
  if (!target) throw new Error(`Google Sheets Search Error: Empty ID for '${sheetName}'.`);
  const rows = await readSheetRows(sheetName);
  const matches = rows.filter(r => r.id === target);
  if (matches.length > 1) throw new Error(`Data Integrity Error: Duplicate ID '${target}' in '${sheetName}'.`);
  return matches[0] || null;
}

export async function appendSheetRow(sheetName: string, rowData: Record<string, string>): Promise<void> {
  const headers = await ensureSchema(sheetName);
  const values = headers.map(header => Object.prototype.hasOwnProperty.call(rowData, header) ? String(rowData[header] ?? '') : '');
  const last = columnLetter(headers.length - 1);
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A:${last}`);
  await sheetsApiFetch(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({ values: [values] }),
  });
}

export async function updateSheetRowById(sheetName: string, id: string, rowData: Record<string, string>): Promise<void> {
  const headers = await ensureSchema(sheetName);
  const values = await getRawValues(sheetName);
  const idIndex = headers.indexOf('id');
  const target = String(id).trim();
  const matches: number[] = [];
  for (let i = 1; i < values.length; i++) if (String(values[i]?.[idIndex] ?? '').trim() === target) matches.push(i + 1);
  if (matches.length === 0) throw new Error(`Google Sheets Update Error: Record '${target}' not found in '${sheetName}'.`);
  if (matches.length > 1) throw new Error(`Data Integrity Error: Duplicate ID '${target}' in '${sheetName}'.`);
  const rowNumber = matches[0];
  const existing = values[rowNumber - 1] || [];
  const updated = headers.map((header, i) => Object.prototype.hasOwnProperty.call(rowData, header) ? String(rowData[header] ?? '') : String(existing[i] ?? ''));
  const last = columnLetter(headers.length - 1);
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A${rowNumber}:${last}${rowNumber}`);
  await sheetsApiFetch(`/values/${range}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [updated] }) });
}
