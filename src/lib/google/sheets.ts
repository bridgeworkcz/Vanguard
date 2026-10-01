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
  Gallery: ['id','title','imageUrl','caption','order','isActive'],
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

const spreadsheetId=()=>{const id=process.env.GOOGLE_SPREADSHEET_ID?.trim();if(!id)throw new Error('GOOGLE_SPREADSHEET_ID is missing.');return id;};
const enc=(v:string)=>encodeURIComponent(v);
async function sheetsFetch<T>(path:string,options:RequestInit={}):Promise<T>{
  const token=await accessToken();
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(!r.ok) throw new Error(`Google Sheets API Error (${r.status}): ${await r.text()}`);
  return r.status===204 ? {} as T : await r.json() as T;
}
function col(n:number):string {let s='';while(n>0){const x=(n-1)%26;s=String.fromCharCode(65+x)+s;n=Math.floor((n-1)/26);}return s;}

async function metadata():Promise<any>{return sheetsFetch('/?fields=sheets.properties');}
async function ensureSheet(name:string):Promise<void>{
  const meta=await metadata();
  const exists=(meta.sheets||[]).some((s:any)=>s.properties?.title===name);
  if(exists)return;
  await sheetsFetch(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:name}}}]})});
}

async function ensureSchema(name:string):Promise<string[]> {
  const schema=SHEET_SCHEMAS[name];
  if(!schema) throw new Error(`Unknown sheet schema: ${name}`);
  await ensureSheet(name);
  const result=await sheetsFetch<{values?:string[][]}>(`/values/${enc(name)}!1:1`);
  const current=(result.values?.[0]||[]).map(String);
  if(current.length===0){
    await sheetsFetch(`/values/${enc(name)}!A1:${col(schema.length)}1?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({range:`${name}!A1:${col(schema.length)}1`,majorDimension:'ROWS',values:[schema]})});
    return [...schema];
  }
  const prefix=current.slice(0, schema.length);
  if(prefix.some((v,i)=>v!==schema[i])) {
    throw new Error(`Sheet schema mismatch for '${name}'. Found [${current.join(', ')}]. Expected [${schema.join(', ')}]. Existing rows were not changed.`);
  }
  if(current.length<schema.length){
    const missing=schema.slice(current.length);
    await sheetsFetch(`/values/${enc(name)}!${col(current.length+1)}1:${col(schema.length)}1?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({range:`${name}!${col(current.length+1)}1:${col(schema.length)}1`,majorDimension:'ROWS',values:[missing]})});
  }
  return [...schema];
}

export async function readSheetRows(name:string):Promise<SheetRow[]> {
  const schema=await ensureSchema(name);
  const result=await sheetsFetch<{values?:string[][]}>(`/values/${enc(name)}!A:${col(schema.length)}`);
  const rows=result.values||[];
  return rows.slice(1).filter(row=>row.some(v=>String(v??'')!=='')).map(row=>Object.fromEntries(schema.map((h,i)=>[h,String(row[i]??'')] )));
}

export async function findSheetRowById(name:string,id:string):Promise<SheetRow|null>{
  const rows=await readSheetRows(name); const found=rows.find(r=>r.id===id); return found||null;
}

export async function appendSheetRow(name:string,row:SheetRow):Promise<void>{
  const schema=await ensureSchema(name);
  if(row.id){
    const existing=await readSheetRows(name);
    if(existing.some(x=>x.id===row.id)) throw new Error(`Duplicate ID '${row.id}' in '${name}'.`);
  }
  const values=[schema.map(h=>row[h]??'')];
  await sheetsFetch(`/values/${enc(name)}!A:${col(schema.length)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values})});
}

export async function updateSheetRowById(name:string,id:string,patch:SheetRow):Promise<void>{
  const schema=await ensureSchema(name);
  const result=await sheetsFetch<{values?:string[][]}>(`/values/${enc(name)}!A:${col(schema.length)}`);
  const values=result.values||[];
  const idx=values.slice(1).findIndex(r=>String(r[0]??'')===id);
  if(idx<0) throw new Error(`Row '${id}' not found in '${name}'.`);
  const rowNumber=idx+2;
  const current=values[rowNumber-1]||[];
  const merged=schema.map((h,i)=>patch[h]!==undefined?String(patch[h]):String(current[i]??''));
  await sheetsFetch(`/values/${enc(name)}!A${rowNumber}:${col(schema.length)}${rowNumber}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({range:`${name}!A${rowNumber}:${col(schema.length)}${rowNumber}`,majorDimension:'ROWS',values:[merged]})});
}

export async function clearSheetBody(name: string): Promise<void> {
  const schema = await ensureSchema(name);
  await sheetsFetch(`/values/${enc(name)}!A2:${col(schema.length)}:clear`, { method: "POST" });
}

export type SheetPrep = { name: string; action: "created" | "extended" | "ready" | "conflict"; detail?: string };

/** Create every canonical tab and add any missing columns. Never rewrites existing cells. */
export async function ensureAllSheets(): Promise<SheetPrep[]> {
  const meta = await metadata();
  const titles = new Set<string>((meta.sheets || []).map((sheet: { properties?: { title?: string } }) => String(sheet.properties?.title || "")));
  const report: SheetPrep[] = [];
  for (const name of Object.keys(SHEET_SCHEMAS)) {
    const schema = SHEET_SCHEMAS[name];
    try {
      let before: string[] = [];
      if (titles.has(name)) {
        const header = await sheetsFetch<{ values?: string[][] }>(`/values/${enc(name)}!1:1`);
        before = (header.values?.[0] || []).map(String);
      }
      await ensureSchema(name);
      if (!titles.has(name)) report.push({ name, action: "created" });
      else if (before.length < schema.length) report.push({ name, action: "extended" });
      else report.push({ name, action: "ready" });
    } catch (err) {
      report.push({ name, action: "conflict", detail: err instanceof Error ? err.message : "Schema conflict" });
    }
  }
  return report;
}
