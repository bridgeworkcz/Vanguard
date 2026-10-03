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

let userDriveToken: { token: string; expiresAt: number } | null = null;
let oauthMissAt = 0;

type DriveOAuth = { clientId: string; clientSecret: string; refreshToken: string };

function envOAuthParts(): DriveOAuth {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "",
    refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || "",
  };
}

function mergeDriveOAuth(sheet: DriveOAuth): DriveOAuth | null {
  const env = envOAuthParts();
  const clientId = env.clientId || sheet.clientId;
  const clientSecret = env.clientSecret || sheet.clientSecret;
  const refreshToken =
    env.refreshToken || (env.clientId && sheet.clientId && env.clientId !== sheet.clientId ? "" : sheet.refreshToken);
  if (clientId && clientSecret && refreshToken) return { clientId, clientSecret, refreshToken };
  return null;
}

export function driveOAuthFromEnv() {
  const env = envOAuthParts();
  return Boolean(env.clientId && env.clientSecret);
}

export function driveOAuthClientConfigured(sheet?: { clientId?: string; clientSecret?: string }) {
  const env = envOAuthParts();
  return Boolean((env.clientId && env.clientSecret) || (sheet?.clientId && sheet?.clientSecret));
}

async function readOAuthMap(): Promise<DriveOAuth> {
  const { readSheetRows } = await import("@/lib/google/sheets");
  const rows = await readSheetRows("SystemSettings");
  const map: Record<string, string> = {};
  for (const row of rows) if (row.key) map[row.key] = row.value;
  return {
    clientId: map.drive_oauth_client_id?.trim() || "",
    clientSecret: map.drive_oauth_client_secret?.trim() || "",
    refreshToken: map.drive_oauth_refresh_token?.trim() || "",
  };
}

async function practiceOAuth(): Promise<DriveOAuth | null> {
  const env = envOAuthParts();
  if (env.clientId && env.clientSecret && env.refreshToken) return env;
  try {
    const merged = mergeDriveOAuth(await readOAuthMap());
    if (merged) return merged;
    if (Date.now() - oauthMissAt < 20_000) return null;
    oauthMissAt = Date.now();
    const { invalidateSheet } = await import("@/lib/google/sheets");
    invalidateSheet("SystemSettings");
    return mergeDriveOAuth(await readOAuthMap());
  } catch (err) {
    console.error("[drive] oauth", err);
  }
  return null;
}

async function tokenForDrive(): Promise<string> {
  const cfg = await practiceOAuth();
  if (!cfg) return getAccessToken();
  const now = Math.floor(Date.now() / 1000);
  if (userDriveToken && userDriveToken.expiresAt > now + 60) return userDriveToken.token;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    userDriveToken = null;
    throw new Error(`Google Drive reconnect: ${text.slice(0, 180)}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  userDriveToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

export function driveAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/drive");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function safeDriveRedirect(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) return "";
  if (url.pathname.replace(/\/$/, "") !== "/google/drive") return "";
  return `${url.origin}/google/drive`;
}

export async function exchangeDriveCode(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await response.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.refresh_token) {
    throw new Error(data.error_description || data.error || "Google did not return a refresh token");
  }
  userDriveToken = null;
  return data.refresh_token;
}

export async function driveConnected(): Promise<boolean> {
  return Boolean(await practiceOAuth());
}

async function driveApiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await tokenForDrive();
  const baseUrl = 'https://www.googleapis.com/drive/v3';
  const joiner = endpoint.includes('?') ? '&' : '?';
  const flagged = `${endpoint}${joiner}supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const response = await fetch(`${baseUrl}${flagged}`, {
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
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`,
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

  const token = await tokenForDrive();
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
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

  const targetFolderId = cleanFolderId || getCredentials().rootFolderId;
  const owner = await practiceOAuth();
  if (!owner) {
    throw new Error("Google Drive Upload Error (403 quota): office Google account is not connected");
  }
  const token = await tokenForDrive();
  const boundary = `vg${crypto.randomBytes(12).toString("hex")}`;
  const meta = JSON.stringify({ name: cleanFileName, parents: [targetFolderId] });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${cleanMimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const payload = Buffer.concat([head, fileBuffer, tail]);
  const uploadResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,parents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength),
    },
  );

  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.text()).slice(0, 280);
    const quota = /storageQuotaExceeded|do not have storage quota/i.test(detail);
    throw new Error(`Google Drive Upload Error (${uploadResponse.status}${quota ? " quota" : ""}): ${detail || "Failed to upload file."}`);
  }
  const uploadData = (await uploadResponse.json()) as { id?: string; parents?: string[]; webViewLink?: string };
  if (!uploadData.id) throw new Error(`Google Drive Upload Error (502): Failed to upload file '${cleanFileName}'.`);
  if (uploadData.parents?.length && !uploadData.parents.includes(targetFolderId)) {
    throw new Error(`Google Drive Upload Error (404): file missed folder ${targetFolderId}`);
  }

  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink,
  };
}


export async function makeFilePublic(fileId:string):Promise<void>{const id=fileId.trim();if(!id)return;const token=await tokenForDrive();const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({type:'anyone',role:'reader'})});if(!r.ok){const body=await r.text();throw new Error(`Google Drive Permission Error (${r.status}): ${body.slice(0,300)}`)}}
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
  const cleanDossierId = dossierId ? dossierId.trim() : "";
  const cleanCategory = categoryFolder ? categoryFolder.trim() : "";
  if (!cleanDossierId || !cleanCategory) {
    throw new Error("Google Drive Error: Invalid dossierId or categoryFolder parameter.");
  }
  return getCredentials().rootFolderId;
}

export async function downloadFileFromDrive(fileId:string):Promise<{buffer:Buffer;mimeType:string;name:string}>{const id=fileId.trim();if(!id)throw new Error('Invalid Drive file ID.');const meta=await driveApiFetch<{name?:string,mimeType?:string}>(`/files/${encodeURIComponent(id)}?fields=name,mimeType`);const token=await tokenForDrive();const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Google Drive Download Error (${r.status})`);return{buffer:Buffer.from(await r.arrayBuffer()),mimeType:meta.mimeType||'application/octet-stream',name:meta.name||'download'}}

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
