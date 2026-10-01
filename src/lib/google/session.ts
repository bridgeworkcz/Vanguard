import crypto from "crypto";

export type SheetSession = { userId: string; email: string; roles: string[]; exp: number };

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (key) return crypto.createHash("sha256").update(key).digest("hex");
  throw new Error("SESSION_SECRET is missing.");
}

export function hashPassword(password: string): string {
  const clean = password.trim();
  if (clean.length < 8) throw new Error("Password must be at least 8 characters long.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(clean, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const clean = password.trim();
  const parts = storedHash.trim().split(":");
  if (!clean || parts.length !== 2) return false;
  const [salt, original] = parts;
  if (!salt || !original) return false;
  try {
    const computed = crypto.pbkdf2Sync(clean, salt, 100000, 64, "sha512");
    const previous = Buffer.from(original, "hex");
    if (computed.length !== previous.length) return false;
    return crypto.timingSafeEqual(computed, previous);
  } catch {
    return false;
  }
}

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createSessionToken(user: { userId: string; email: string; roles: string[] }, seconds = 86400): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...user, iat: now, exp: now + seconds };
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string): SheetSession | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;
  const expected = crypto.createHmac("sha256", secret()).update(`${header}.${payload}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SheetSession;
    if (!data.userId || !data.email || !Array.isArray(data.roles) || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
