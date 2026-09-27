import crypto from 'crypto';

interface GoogleCredentials {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedAccessToken: CachedToken | null = null;

// --- 1. Єдина канонічна схема отримання Credentials (process.env) ---

function getCredentials(): GoogleCredentials {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error(
      'Server Config Error: Missing required Google Service Account environment variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SPREADSHEET_ID).'
    );
  }

  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  return {
    clientEmail,
    privateKey: formattedPrivateKey,
    spreadsheetId,
  };
}

// --- 2. Генерація OAuth2 JWT Токена (RS256) ---

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const creds = getCredentials();

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const claimSet = {
    iss: creds.clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const base64UrlEncode = (obj: object): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const encodedHeader = base64UrlEncode(header);
  const encodedClaimSet = base64UrlEncode(claimSet);
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer
    .sign(creds.privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signatureInput}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth2 Error (${response.status}): Authentication failed against Google servers.`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return data.access_token;
}

// --- 3. Базова HTTP-утиліта до Google Sheets API v4 ---

async function sheetsApiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const creds = getCredentials();
  const token = await getAccessToken();
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${creds.spreadsheetId}`;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets API Error (${response.status}): Request failed for endpoint ${endpoint}`);
  }

  return response.json() as Promise<T>;
}

// --- 4. Перевірка цілісності та валідація заголовков (Header Validation) ---

function validateAndExtractHeaders(values: string[][], sheetName: string): string[] {
  if (!values || values.length === 0 || !values[0] || values[0].length === 0) {
    throw new Error(`Google Sheets Schema Error: Sheet '${sheetName}' is empty or missing a header row.`);
  }

  const rawHeaders = values[0];
  const headers: string[] = [];
  const seenHeaders = new Set<string>();

  for (let i = 0; i < rawHeaders.length; i++) {
    const h = String(rawHeaders[i] || '').trim();
    if (!h) {
      throw new Error(`Google Sheets Schema Error: Empty header name detected at column ${i + 1} in sheet '${sheetName}'.`);
    }
    if (seenHeaders.has(h)) {
      throw new Error(`Google Sheets Schema Error: Duplicate header name '${h}' detected in sheet '${sheetName}'.`);
    }
    seenHeaders.add(h);
    headers.push(h);
  }

  return headers;
}

// --- 5. Публічні дженерик-функції (Generic Infrastructure Layer) ---

export async function readSheetRows(sheetName: string): Promise<Record<string, string>[]> {
  const range = encodeURIComponent(sheetName);
  interface ValuesResponse {
    values?: string[][];
  }

  const data = await sheetsApiFetch<ValuesResponse>(`/values/${range}`);

  if (!data.values || data.values.length === 0) {
    return [];
  }

  const headers = validateAndExtractHeaders(data.values, sheetName);
  const rows = data.values.slice(1);

  return rows.map(row => {
    const record: Record<string, string> = {};
    headers.forEach((header, colIndex) => {
      record[header] = row[colIndex] !== undefined ? String(row[colIndex]).trim() : '';
    });
    return record;
  });
}

export async function findSheetRowById(
  sheetName: string,
  id: string,
  idColumn = 'id'
): Promise<Record<string, string> | null> {
  const rows = await readSheetRows(sheetName);
  const targetId = String(id).trim();

  if (!targetId) {
    throw new Error(`Google Sheets Search Error: Cannot search with an empty ID on sheet '${sheetName}'.`);
  }

  const matches = rows.filter(r => r[idColumn] === targetId);

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new Error(
      `Data Integrity Error: Multiple records (${matches.length}) found for ID '${targetId}' in column '${idColumn}' on sheet '${sheetName}'.`
    );
  }

  return matches[0];
}

export async function appendSheetRow(
  sheetName: string,
  rowData: Record<string, string>
): Promise<void> {
  const headerRange = encodeURIComponent(`${sheetName}!1:1`);
  const appendRange = encodeURIComponent(`${sheetName}!A1`);

  interface HeaderResponse {
    values?: string[][];
  }

  const headerData = await sheetsApiFetch<HeaderResponse>(`/values/${headerRange}`);
  const headers = validateAndExtractHeaders(headerData.values || [], sheetName);

  const rowValues = headers.map(header =>
    Object.prototype.hasOwnProperty.call(rowData, header) && rowData[header] !== undefined
      ? String(rowData[header])
      : ''
  );

  await sheetsApiFetch(`/values/${appendRange}:append?valueInputOption=RAW`, {
    method: 'POST',
    body: JSON.stringify({
      values: [rowValues],
    }),
  });
}

export async function updateSheetRowById(
  sheetName: string,
  id: string,
  rowData: Record<string, string>,
  idColumn = 'id'
): Promise<void> {
  const fullSheetRange = encodeURIComponent(sheetName);
  interface ValuesResponse {
    values?: string[][];
  }

  const rawData = await sheetsApiFetch<ValuesResponse>(`/values/${fullSheetRange}`);

  if (!rawData.values || rawData.values.length === 0) {
    throw new Error(`Google Sheets Schema Error: Sheet '${sheetName}' is empty.`);
  }

  const headers = validateAndExtractHeaders(rawData.values, sheetName);
  const idColIndex = headers.indexOf(idColumn);

  if (idColIndex === -1) {
    throw new Error(`Google Sheets Schema Error: ID column '${idColumn}' not found in sheet '${sheetName}'.`);
  }

  const targetId = String(id).trim();
  if (!targetId) {
    throw new Error(`Google Sheets Update Error: Cannot update row with empty ID on sheet '${sheetName}'.`);
  }

  const matches: { rowIndex: number; existingRow: string[] }[] = [];

  for (let i = 1; i < rawData.values.length; i++) {
    const rowVal = rawData.values[i][idColIndex];
    if (rowVal !== undefined && String(rowVal).trim() === targetId) {
      matches.push({
        rowIndex: i + 1, // 1-based index у Google Sheets
        existingRow: rawData.values[i],
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(`Google Sheets Update Error: Record with ID '${targetId}' not found in sheet '${sheetName}'.`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Data Integrity Error: Cannot update row. Multiple records (${matches.length}) found for ID '${targetId}' in column '${idColumn}' on sheet '${sheetName}'.`
    );
  }

  const { rowIndex, existingRow } = matches[0];

  const updatedRowValues = headers.map((header, colIndex) => {
    if (Object.prototype.hasOwnProperty.call(rowData, header) && rowData[header] !== undefined) {
      return String(rowData[header]);
    }
    return existingRow[colIndex] !== undefined ? String(existingRow[colIndex]) : '';
  });

  const updateRange = encodeURIComponent(`${sheetName}!${rowIndex}:${rowIndex}`);

  await sheetsApiFetch(`/values/${updateRange}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({
      values: [updatedRowValues],
    }),
  });
}
