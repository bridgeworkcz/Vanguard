import crypto from 'crypto';

function parsePrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return '';
  let key = rawKey.trim();
  
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, '\n').replace(/\r/g, '');

  const base64Body = key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  if (!base64Body) return '';

  const chunked = base64Body.match(/.{1,64}/g)?.join('\n') || base64Body;

  return `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----\n`;
}

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

function getCredentials(): GoogleDriveCredentials {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!clientEmail || !rawPrivateKey || !rootFolderId) {
    throw new Error(
      'Server Config Error: Missing required Google Drive environment variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_ROOT_FOLDER_ID).'
    );
  }

  return {
    clientEmail: clientEmail.trim(),
    privateKey: parsePrivateKey(rawPrivateKey),
    rootFolderId: rootFolderId.trim(),
  };
}

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
    scope: 'https://www.googleapis.com/auth/drive',
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
    const errorText = await response.text();
    throw new Error(`Google OAuth2 Error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return data.access_token;
}

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
    const errText = await response.text();
    throw new Error(`Google Drive API Error (${response.status}): ${errText}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

async function findFolder(parentFolderId: string, folderName: string): Promise<string | null> {
  const cleanParentId = parentFolderId ? parentFolderId.trim() : "";
  const cleanName = folderName ? folderName.trim() : "";
  if (!cleanParentId || !cleanName) return null;
  const sanitizedQueryName = cleanName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = `'${cleanParentId}' in parents and name = '${sanitizedQueryName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchResult = await driveApiFetch<{ files?: { id: string; name: string }[] }>(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
  );
  const files = searchResult.files || [];
  if (files.length > 1) {
    throw new Error(`Data Integrity Error: Multiple folders with name '${cleanName}' found inside parent folder.`);
  }
  return files[0]?.id ?? null;
}

export async function findOrCreateFolder(parentFolderId: string, folderName: string): Promise<string> {
  const cleanParentId = parentFolderId ? parentFolderId.trim() : '';
  const cleanName = folderName ? folderName.trim() : '';

  if (!cleanParentId || !cleanName) {
    throw new Error('Google Drive Error: Invalid parentFolderId or folderName.');
  }

  const existing = await findFolder(cleanParentId, cleanName);
  if (existing) return existing;

  const token = await getAccessToken();
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [cleanParentId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Google Drive Folder Error (${createResponse.status}): Failed to create folder '${cleanName}'.`);
  }

  const createdData = (await createResponse.json()) as { id: string };
  return createdData.id;
}

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<{ fileId: string; webViewLink?: string }> {
  const cleanFolderId = folderId ? folderId.trim() : '';
  const cleanFileName = fileName ? fileName.trim() : '';
  const cleanMimeType = mimeType ? mimeType.trim() : 'application/octet-stream';

  if (!cleanFolderId || !cleanFileName || !fileBuffer || fileBuffer.length === 0) {
    throw new Error('Google Drive Upload Error: Invalid parameters or empty file buffer.');
  }

  const token = await getAccessToken();
  const boundary = `-------VanguardVaultBoundary${Date.now()}`;

  const metadata = {
    name: cleanFileName,
    parents: [cleanFolderId],
  };

  const headerPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeaderPart = `--${boundary}\r\nContent-Type: ${cleanMimeType}\r\n\r\n`;
  const footerPart = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(headerPart, 'utf8'),
    Buffer.from(fileHeaderPart, 'utf8'),
    fileBuffer,
    Buffer.from(footerPart, 'utf8'),
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
    throw new Error(`Google Drive Upload Error (${uploadResponse.status}): Failed to upload file '${cleanFileName}'.`);
  }

  const uploadData = (await uploadResponse.json()) as { id: string; webViewLink?: string };

  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink,
  };
}


export async function makeFilePublic(fileId:string):Promise<void>{const id=fileId.trim();if(!id)return;const token=await getAccessToken();const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({type:'anyone',role:'reader'})});if(!r.ok){const body=await r.text();throw new Error(`Google Drive Permission Error (${r.status}): ${body.slice(0,300)}`)}}
export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const cleanId = fileId ? fileId.trim() : '';
  if (!cleanId) return;

  await driveApiFetch(`/files/${cleanId}`, {
    method: 'DELETE',
  });
}

const FOLDER_ALIASES: Record<string, string[]> = {
  Dossiers: ["02_DOSSIERS", "Dossiers"],
  Backups: ["99_ARCHIVE", "Backups"],
  Gallery: ["08_WEBSITE", "Gallery"],
  Team: ["07_TEAM", "Team"],
  Invoices: ["05_GENERATED_DOCUMENTS", "Invoices"],
  Contracts: ["10_TEMPLATES", "Contracts"],
};

/** Use a folder the practice already named, otherwise create the plain English one. */
export async function resolveVaultFolder(parentFolderId: string, logicalName: string): Promise<string> {
  const aliases = FOLDER_ALIASES[logicalName] ?? [logicalName];
  for (const name of aliases) {
    const id = await findFolder(parentFolderId, name);
    if (id) return id;
  }
  return findOrCreateFolder(parentFolderId, logicalName);
}

export async function getDossierCategoryFolder(dossierId: string, categoryFolder: string): Promise<string> {
  const cleanDossierId = dossierId ? dossierId.trim() : '';
  const cleanCategory = categoryFolder ? categoryFolder.trim() : '';

  if (!cleanDossierId || !cleanCategory) {
    throw new Error('Google Drive Error: Invalid dossierId or categoryFolder parameter.');
  }

  const creds = getCredentials();
  if (cleanDossierId === "team" || cleanDossierId === "gallery") {
    const library = await resolveVaultFolder(creds.rootFolderId, cleanDossierId === "team" ? "Team" : "Gallery");
    return findOrCreateFolder(library, cleanCategory);
  }
  const dossiersFolderId = await resolveVaultFolder(creds.rootFolderId, "Dossiers");
  const dossierFolderId = await findOrCreateFolder(dossiersFolderId, cleanDossierId);
  return findOrCreateFolder(dossierFolderId, cleanCategory);
}

export async function downloadFileFromDrive(fileId:string):Promise<{buffer:Buffer;mimeType:string;name:string}>{const id=fileId.trim();if(!id)throw new Error('Invalid Drive file ID.');const meta=await driveApiFetch<{name?:string,mimeType?:string}>(`/files/${encodeURIComponent(id)}?fields=name,mimeType`);const token=await getAccessToken();const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Google Drive Download Error (${r.status})`);return{buffer:Buffer.from(await r.arrayBuffer()),mimeType:meta.mimeType||'application/octet-stream',name:meta.name||'download'}}

export const VAULT_FOLDERS = ["Dossiers", "Backups", "Gallery", "Team", "Invoices", "Contracts"] as const;

/** Create the vault folders under the configured root. Existing folders are left as they are. */
export async function ensureVaultFolders(): Promise<string[]> {
  const root = getCredentials().rootFolderId;
  const ready: string[] = [];
  for (const name of VAULT_FOLDERS) {
    await resolveVaultFolder(root, name);
    ready.push(name);
  }
  return ready;
}
