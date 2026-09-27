import crypto from 'crypto';

interface GoogleDriveCredentials {
  clientEmail: string;
  privateKey: string;
  rootFolderId: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedAccessToken: CachedToken | null = null;

// --- 1. Отримання та валідація конфігурації Credentials ---

function getCredentials(): GoogleDriveCredentials {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!clientEmail || !privateKey || !rootFolderId) {
    throw new Error(
      'Server Config Error: Missing required Google Drive environment variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_ROOT_FOLDER_ID).'
    );
  }

  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  return {
    clientEmail,
    privateKey: formattedPrivateKey,
    rootFolderId,
  };
}

// --- 2. Генерація OAuth2 JWT Токена для Google Drive API v3 (RS256) ---

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
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
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
    throw new Error(`Google OAuth2 Error (${response.status}): Authentication failed against Google OAuth servers.`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return data.access_token;
}

// --- 3. Базова HTTP-утиліта до Google Drive API v3 ---

async function driveApiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const baseUrl = 'https://www.googleapis.com/drive/v3';

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Google Drive API Error (${response.status}): Request failed for endpoint ${endpoint}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// --- 4. Публічні сервісні функції роботи з папочками та файлами Vault ---

/**
  Знаходить або створює підпапку з вказаною назвою всередині батьківської папки.
 */
export async function findOrCreateFolder(parentFolderId: string, folderName: string): Promise<string> {
  const cleanName = folderName.trim().replace(/'/g, "\\'");
  const query = `'${parentFolderId}' in parents and name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  interface SearchResponse {
    files?: { id: string; name: string }[];
  }

  const searchResult = await driveApiFetch<SearchResponse>(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
  );

  if (searchResult.files && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }

  // Створення папки
  const token = await getAccessToken();
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Google Drive Folder Error (${createResponse.status}): Failed to create folder '${folderName}'.`);
  }

  const createdData = (await createResponse.json()) as { id: string };
  return createdData.id;
}

/**
  Завантажує бінарний файл (Buffer) у вказану папку Google Drive via Multipart Upload.
 */
export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<{ fileId: string; webViewLink?: string }> {
  const token = await getAccessToken();
  const boundary = `-------314159265358979323846_${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const multipartBody = Buffer.concat([
    Buffer.from(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`
    ),
    Buffer.from(`${delimiter}Content-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length),
      },
      body: multipartBody,
    }
  );

  if (!uploadResponse.ok) {
    throw new Error(`Google Drive Upload Error (${uploadResponse.status}): Failed to upload file '${fileName}'.`);
  }

  const uploadData = (await uploadResponse.json()) as { id: string; webViewLink?: string };

  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink,
  };
}

/**
  Видаляє файл за його Drive File ID.
 */
export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const cleanId = fileId.trim();
  if (!cleanId) {
    throw new Error('Google Drive Delete Error: Cannot delete file with an empty fileId.');
  }

  await driveApiFetch(`/files/${cleanId}`, {
    method: 'DELETE',
  });
}

/**
  Отримує пряму структуру папки досьє: Dossiers / {dossierId} / {categoryFolder}
 */
export async function getDossierCategoryFolder(dossierId: string, categoryFolder: string): Promise<string> {
  const creds = getCredentials();

  // 1. Папка "Dossiers" у корені Vault
  const dossiersFolderId = await findOrCreateFolder(creds.rootFolderId, 'Dossiers');

  // 2. Папка конкретного досьє (наприклад, "BW-2026-000001")
  const dossierFolderId = await findOrCreateFolder(dossiersFolderId, dossierId);

  // 3. Категоріальна підпапка (наприклад, "01_Passport")
  const categoryFolderId = await findOrCreateFolder(dossierFolderId, categoryFolder);

  return categoryFolderId;
}
