import crypto from 'crypto';

export type SheetRow = Record<string,string>;

type Schema = readonly string[];

export const SHEET_SCHEMAS: Record<string, Schema> = {
  Users: ['id','email','phone','fullName','roles','passwordHash','createdAt','lastLoginAt','isActive'],
  Dossiers: ['id','userId','fullName','passportNumber','citizenship','targetCountry','vacancyId','vacancyTitle','processStatus','paymentStatus','currency','totalCost','paidAmount','remainingAmount','assignedManagerId','createdAt','updatedAt'],
  DossierDocuments: ['id','dossierId','category','fileName','driveFileId','status','uploadedAt','reviewedAt','reviewedBy','rejectionReason','mime'],
  PaymentTransactions: ['id','dossierId','userId','amount','currency','network','txHash','tranchePercent','trancheKey','status','submittedAt','verifiedAt','verifiedBy','proofFileId','proofFileName'],
  Vacancies: ['id','title','category','country','salaryNet','salaryGross','accommodation','workingHours','description','quotaRemaining','isActive','visaProductId','visaDuration','processingOptions','employerLabel','requirements','createdAt','updatedAt','blockedCitizenships'],
  Team: ['id','fullName','position','photoUrl','contactPhone','languages','bio','order','isActive'],
  AuditLog: ['id','actorUserId','action','targetEntity','targetEntityId','details','timestamp'],
  Applications: ['id','userId','vacancyId','applicantData','status','stage','visaProductId','country','processingOption','totalCost','currency','processStage','paymentDeadlineAt','documentDeadlineAt','assignedManagerId','createdAt','updatedAt','approvedAt','rejectedReason'],
  Pricing: ['id','name','description','amount','currency','active','updatedAt','updatedBy'],
  SystemSettings: ['id','key','value','updatedAt','updatedBy'],
  Gallery: ['id','title','imageUrl','caption','order','isActive','kind','country','vacancyId','startsAt','endsAt','cover'],
  SupportTickets: ['id','userId','dossierId','subject','message','status','assignedManagerId','createdAt','updatedAt'],
  Backups: ['id','createdBy','driveFileId','fileName','createdAt'],
  OpenCases: ['id','snapshotAt','applicationId','email','country','stage','status','deadline'],
};

function parsePrivateKey(raw: string | undefined): string {
  if (!raw) return '';
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1,-1);
  key = key.replace(/\\n/g,'\n').replace(/\r/g,'');
  if (key.includes('BEGIN PRIVATE KEY')) return key;
  const body = key.replace(/\s+/g,'');
  const chunks = body.match(/.{1,64}/g)?.join('\n') || body;
  return `-----BEGIN PRIVATE KEY-----\n${chunks}\n-----END PRIVATE KEY-----\n`;
}

let cachedToken: {token:string;expiresAt:number}|null = null;
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now()/1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;
  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const key = parsePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  if (!email || !key) throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.');
  const b64 = (v:object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = b64({alg:'RS256',typ:'JWT'});
  const claim = b64({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const input = `${head}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256'); signer.update(input);
  const sig = signer.sign(key,'base64url');
  const assertion = `${input}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if (!r.ok) throw new Error(`Google Sheets OAuth2 Error (${r.status}): ${await r.text()}`);
  const d = await r.json() as {access_token:string;expires_in:number};
  cachedToken={token:d.access_token,expiresAt:now+d.expires_in};
  return d.access_token;
}

const spreadsheetId = () => {
  const id = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID is missing.");
  return id;
};
const enc = (v: string) => encodeURIComponent(v);

export const SHEETS_BUSY = "The register is busy. Reload in a minute.";

function sheetFail(status: number, body: string): Error {
  console.error(`[sheets] ${status} ${body.slice(0, 400)}`);
  if (status === 429 || status === 503) return new Error(SHEETS_BUSY);
  return new Error("The register is unavailable.");
}

async function sheetsFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!r.ok) throw sheetFail(r.status, await r.text());
  return r.status === 204 ? ({} as T) : ((await r.json()) as T);
}
function col(n:number):string {let s='';while(n>0){const x=(n-1)%26;s=String.fromCharCode(65+x)+s;n=Math.floor((n-1)/26);}return s;}

async function metadata(): Promise<{ sheets?: { properties?: { title?: string } }[] }> {
  return sheetsFetch("/?fields=sheets.properties");
}

const TITLE_TTL = 10 * 60 * 1000;
const ROW_TTL = 45_000;
let titleCache: { at: number; titles: Set<string> } | null = null;
const headerCache = new Map<string, string[]>();
const rowCache = new Map<string, { at: number; rows: SheetRow[] }>();
const rowFlight = new Map<string, Promise<SheetRow[]>>();

export function invalidateSheet(name: string) {
  rowCache.delete(name);
}

async function titles(): Promise<Set<string>> {
  if (titleCache && Date.now() - titleCache.at < TITLE_TTL) return titleCache.titles;
  const meta = await metadata();
  const next = new Set<string>((meta.sheets || []).map((sheet) => String(sheet.properties?.title || "")));
  titleCache = { at: Date.now(), titles: next };
  return next;
}

async function ensureSheet(name: string): Promise<void> {
  const have = await titles();
  if (have.has(name)) return;
  await sheetsFetch(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name } } }] }) });
  have.add(name);
}

function rowsFrom(schema: string[], values: string[][]): SheetRow[] {
  return values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "") !== ""))
    .map((row) => Object.fromEntries(schema.map((header, index) => [header, String(row[index] ?? "")])));
}

async function batchValues(ranges: string[]): Promise<string[][][]> {
  if (!ranges.length) return [];
  const query = ranges.map((range) => `ranges=${enc(range)}`).join("&");
  const result = await sheetsFetch<{ valueRanges?: { values?: string[][] }[] }>(`/values:batchGet?${query}`);
  return ranges.map((_, index) => result.valueRanges?.[index]?.values || []);
}

async function ensureSchema(name: string): Promise<string[]> {
  const known = headerCache.get(name);
  if (known) return known;
  const schema = SHEET_SCHEMAS[name];
  if (!schema) throw new Error(`Unknown sheet schema: ${name}`);
  await ensureSheet(name);
  const result = await sheetsFetch<{ values?: string[][] }>(`/values/${enc(name)}!1:1`);
  let current = (result.values?.[0] || []).map(String);
  while (current.length && current[current.length - 1] === "") current = current.slice(0, -1);
  if (current.length === 0) {
    await sheetsFetch(`/values/${enc(name)}!A1:${col(schema.length)}1?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ range: `${name}!A1:${col(schema.length)}1`, majorDimension: "ROWS", values: [schema] }),
    });
    current = [...schema];
  } else {
    const have = new Set(current);
    const missing = schema.filter((header) => !have.has(header));
    if (missing.length) {
      const start = current.length + 1;
      const end = current.length + missing.length;
      await sheetsFetch(`/values/${enc(name)}!${col(start)}1:${col(end)}1?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ range: `${name}!${col(start)}1:${col(end)}1`, majorDimension: "ROWS", values: [missing] }),
      });
      current = [...current, ...missing];
    }
  }
  headerCache.set(name, current);
  return current;
}

export async function readSheetRows(name: string): Promise<SheetRow[]> {
  const hit = rowCache.get(name);
  if (hit && Date.now() - hit.at < ROW_TTL) return hit.rows;
  const flight = rowFlight.get(name);
  if (flight) return flight;
  const job = (async () => {
    try {
      const schema = await ensureSchema(name);
      const result = await sheetsFetch<{ values?: string[][] }>(`/values/${enc(name)}!A:${col(schema.length)}`);
      const rows = rowsFrom(schema, result.values || []);
      rowCache.set(name, { at: Date.now(), rows });
      return rows;
    } catch (err) {
      if (hit) return hit.rows;
      throw err;
    }
  })();
  rowFlight.set(name, job);
  try {
    return await job;
  } finally {
    if (rowFlight.get(name) === job) rowFlight.delete(name);
  }
}

/** One quota unit for every sheet a page needs. Later reads in this process reuse the result. */
export async function primeSheetRows(names: string[]): Promise<void> {
  const need = [...new Set(names)].filter((name) => {
    const hit = rowCache.get(name);
    return !(hit && Date.now() - hit.at < ROW_TTL) && !rowFlight.has(name);
  });
  if (!need.length) return;
  const job = (async () => {
    const schemas = await Promise.all(need.map((name) => ensureSchema(name)));
    const grids = await batchValues(need.map((name, index) => `${name}!A:${col(schemas[index].length)}`));
    const out = new Map<string, SheetRow[]>();
    need.forEach((name, index) => {
      const rows = rowsFrom(schemas[index], grids[index] || []);
      rowCache.set(name, { at: Date.now(), rows });
      out.set(name, rows);
    });
    return out;
  })();
  for (const name of need) {
    const one = job.then((map) => map.get(name) || []);
    rowFlight.set(name, one);
    void one.finally(() => {
      if (rowFlight.get(name) === one) rowFlight.delete(name);
    });
  }
  try {
    await job;
  } catch (err) {
    if (need.every((name) => rowCache.has(name))) return;
    throw err;
  }
}

export async function findSheetRowById(name:string,id:string):Promise<SheetRow|null>{
  const rows=await readSheetRows(name); const found=rows.find(r=>r.id===id); return found||null;
}

export async function appendSheetRow(name:string,row:SheetRow):Promise<void>{
  await appendSheetRows(name, [row], true);
}

export async function appendSheetRows(name: string, rows: SheetRow[], checkDup = false): Promise<void> {
  if (!rows.length) return;
  const schema = await ensureSchema(name);
  if (checkDup) {
    invalidateSheet(name);
    const existing = await readSheetRows(name);
    const ids = new Set(existing.map((row) => row.id));
    for (const row of rows) {
      if (row.id && ids.has(row.id)) throw new Error(`Duplicate ID '${row.id}' in '${name}'.`);
    }
  }
  const values = rows.map((row) => schema.map((header) => row[header] ?? ""));
  const chunk = 500;
  for (let index = 0; index < values.length; index += chunk) {
    const slice = values.slice(index, index + chunk);
    await sheetsFetch(`/values/${enc(name)}!A:${col(schema.length)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ majorDimension: "ROWS", values: slice }),
    });
  }
  invalidateSheet(name);
}

export async function updateSheetRowById(name:string,id:string,patch:SheetRow):Promise<void>{
  const schema=await ensureSchema(name);
  const idIndex=Math.max(0, schema.indexOf('id'));
  const result=await sheetsFetch<{values?:string[][]}>(`/values/${enc(name)}!A:${col(schema.length)}`);
  const values=result.values||[];
  const idx=values.slice(1).findIndex(r=>String(r[idIndex]??'')===id);
  if(idx<0) throw new Error(`Row '${id}' not found in '${name}'.`);
  const rowNumber=idx+2;
  const current=values[rowNumber-1]||[];
  const merged=schema.map((h,i)=>patch[h]!==undefined?String(patch[h]):String(current[i]??''));
  await sheetsFetch(`/values/${enc(name)}!A${rowNumber}:${col(schema.length)}${rowNumber}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({range:`${name}!A${rowNumber}:${col(schema.length)}${rowNumber}`,majorDimension:'ROWS',values:[merged]})});
  invalidateSheet(name);
}

export async function clearSheetBody(name: string): Promise<void> {
  const schema = await ensureSchema(name);
  await sheetsFetch(`/values/${enc(name)}!A2:${col(schema.length)}:clear`, { method: "POST" });
  invalidateSheet(name);
}

export type SheetPrep = { name: string; action: "created" | "extended" | "ready" | "conflict"; detail?: string };

/** Create every canonical tab and add any missing columns. Never rewrites existing cells. */
export async function ensureAllSheets(): Promise<SheetPrep[]> {
  const meta = await metadata();
  const known = new Set<string>((meta.sheets || []).map((sheet) => String(sheet.properties?.title || "")));
  titleCache = { at: Date.now(), titles: known };
  const names = Object.keys(SHEET_SCHEMAS);
  const existing = names.filter((name) => known.has(name));
  const headerRows = new Map<string, string[]>();
  if (existing.length) {
    const grids = await batchValues(existing.map((name) => `${name}!1:1`));
    existing.forEach((name, index) => {
      let row = (grids[index]?.[0] || []).map(String);
      while (row.length && row[row.length - 1] === "") row = row.slice(0, -1);
      headerRows.set(name, row);
    });
  }
  const report: SheetPrep[] = [];
  for (const name of names) {
    try {
      const schema = SHEET_SCHEMAS[name];
      if (!known.has(name)) {
        await ensureSheet(name);
        await sheetsFetch(`/values/${enc(name)}!A1:${col(schema.length)}1?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ range: `${name}!A1:${col(schema.length)}1`, majorDimension: "ROWS", values: [schema] }),
        });
        headerCache.set(name, [...schema]);
        report.push({ name, action: "created" });
        continue;
      }
      const before = headerRows.get(name) || [];
      if (!before.length) {
        await sheetsFetch(`/values/${enc(name)}!A1:${col(schema.length)}1?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ range: `${name}!A1:${col(schema.length)}1`, majorDimension: "ROWS", values: [schema] }),
        });
        headerCache.set(name, [...schema]);
        report.push({ name, action: "extended" });
        continue;
      }
      const have = new Set(before);
      const missing = schema.filter((header) => !have.has(header));
      let current = before;
      if (missing.length) {
        const start = current.length + 1;
        const end = current.length + missing.length;
        await sheetsFetch(`/values/${enc(name)}!${col(start)}1:${col(end)}1?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ range: `${name}!${col(start)}1:${col(end)}1`, majorDimension: "ROWS", values: [missing] }),
        });
        current = [...current, ...missing];
        report.push({ name, action: "extended" });
      } else report.push({ name, action: "ready" });
      headerCache.set(name, current);
    } catch (err) {
      report.push({ name, action: "conflict", detail: err instanceof Error ? err.message : "Schema conflict" });
    }
  }
  return report;
}
