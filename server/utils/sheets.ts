import crypto from 'crypto';

function parsePrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return '';
  let key = rawKey.trim();
  
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, '\n').replace(/\r/g, '');

  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  }

  return key;
}

interface GoogleSheetsCredentials {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedAccessToken: CachedToken | null = null;

function getCredentials(): GoogleSheetsCredentials {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
    throw new Error(
      `Server Config Error: Missing ENV (EMAIL: ${!!clientEmail}, KEY: ${!!rawPrivateKey}, SHEET_ID: ${!!spreadsheetId})`
    );
  }

  return {
    clientEmail: clientEmail.trim(),
    privateKey: parsePrivateKey(rawPrivateKey),
    spreadsheetId: spreadsheetId.trim(),
  };
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const creds = getCredentials();

  const header = { alg: 'RS256', typ: 'JWT' };
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

  try {
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Auth Token Rejected (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };

    cachedAccessToken = {
      token: data.access_token,
      expiresAt: now + data.expires_in,
    };

    return data.access_token;
  } catch (err: any) {
    throw new Error(`RSA Signing / Google OAuth Error: ${err.message || err}`);
  }
}

async function sheetsApiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const creds = getCredentials();
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
    const errBody = await response.text();
    throw new Error(`Google Sheets API Error (${response.status}): ${errBody}`);
  }

  return response.json() as Promise<T>;
}

export async function readSheetRows(sheetName: string): Promise<Record<string, string>[]> {
  interface ValueRenderResponse {
    values?: string[][];
  }

  // Обмежуємо зчитування лише колонками A-Z
  const res = await sheetsApiFetch<ValueRenderResponse>(
    `/values/${encodeURIComponent(sheetName)}!A1:Z1000?valueRenderOption=UNFORMATTED_VALUE`
  );

  const rows = res.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim());
  const result: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const record: Record<string, string> = {};
    let hasData = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const val = row[index] !== undefined && row[index] !== null ? String(row[index]).trim() : '';
      record[header] = val;
      if (val !== '') hasData = true;
    });

    if (hasData && record.id) {
      result.push(record);
    }
  }

  return result;
}

export async function findSheetRowById(sheetName: string, id: string): Promise<Record<string, string> | null> {
  const rows = await readSheetRows(sheetName);
  return rows.find(r => r.id === id) || null;
}

export async function appendSheetRow(sheetName: string, rowData: Record<string, string>): Promise<void> {
  interface ValueRenderResponse {
    values?: string[][];
  }

  // 1. Отримуємо заголовки лише з першого рядка A1:Z1
  const res = await sheetsApiFetch<ValueRenderResponse>(
    `/values/${encodeURIComponent(sheetName)}!A1:Z1?valueRenderOption=UNFORMATTED_VALUE`
  );

  let headers: string[] = [];
  const rows = res.values || [];

  const defaultHeadersMap: Record<string, string[]> = {
    Users: ['id', 'email', 'phone', 'fullName', 'roles', 'passwordHash', 'createdAt', 'lastLoginAt'],
    Dossiers: ['id', 'userId', 'vacancyId', 'status', 'createdAt', 'updatedAt'],
    Documents: ['id', 'dossierId', 'userId', 'category', 'fileName', 'fileUrl', 'status', 'createdAt'],
    Payments: ['id', 'dossierId', 'userId', 'amount', 'currency', 'status', 'createdAt'],
  };

  // Якщо рядок 1 порожній — автоматично прописуємо канонічні заголовки
  if (!rows || rows.length === 0 || !rows[0] || rows[0].length === 0 || !rows[0][0]) {
    headers = defaultHeadersMap[sheetName] || Object.keys(rowData);
    await sheetsApiFetch(
      `/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [headers] }),
      }
    );
  } else {
    headers = rows[0].map(h => String(h).trim());
  }

  const valuesToAppend = headers.map(h => rowData[h] ?? '');
  const lastColLetter = String.fromCharCode(64 + Math.min(headers.length, 26));

  // 2. Додаємо новий рядок ЖОРСТКО в межах колонок A..lastCol
  await sheetsApiFetch(
    `/values/${encodeURIComponent(sheetName)}!A1:${lastColLetter}1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [valuesToAppend],
      }),
    }
  );
}

export async function updateSheetRowById(
  sheetName: string,
  id: string,
  rowData: Record<string, string>
): Promise<void> {
  interface ValueRenderResponse {
    values?: string[][];
  }

  const res = await sheetsApiFetch<ValueRenderResponse>(
    `/values/${encodeURIComponent(sheetName)}!A1:Z1000?valueRenderOption=UNFORMATTED_VALUE`
  );

  const rows = res.values || [];
  if (rows.length < 2) {
    throw new Error(`Google Sheets Error: Sheet '${sheetName}' does not contain data rows.`);
  }

  const headers = rows[0].map(h => String(h).trim());
  const idIndex = headers.indexOf('id');

  if (idIndex === -1) {
    throw new Error(`Google Sheets Error: Column 'id' not found in header row of sheet '${sheetName}'.`);
  }

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] && String(rows[i][idIndex]).trim() === id) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error(`Google Sheets Error: Record with id '${id}' not found in sheet '${sheetName}'.`);
  }

  const updatedValues = headers.map(h => rowData[h] ?? '');

  await sheetsApiFetch(
    `/values/${encodeURIComponent(sheetName)}!A${rowIndex}:${encodeURIComponent(sheetName)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [updatedValues],
      }),
    }
  );
}
