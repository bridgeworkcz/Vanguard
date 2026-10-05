import { getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE = "vg_session";
const OWNER = "admin@gmail.com";

export function sheetsConfigured(): boolean {
  return Boolean(process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim());
}

function emailOf(value: string): string {
  return value.trim().toLowerCase();
}

function phoneOf(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  return plus + raw.replace(/\D/g, "");
}

function rolesOf(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* older rows stored a plain role string */
  }
  const list = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return list.length ? list : ["CLIENT"];
}

function withOwner(email: string, roles: string[]): string[] {
  if (email !== OWNER) return roles;
  return Array.from(new Set([...roles, "ADMIN", "MANAGER"]));
}

function publicUser(row: Record<string, string>) {
  const email = emailOf(row.email);
  const roles = withOwner(email, rolesOf(row.roles));
  return {
    id: row.id,
    email,
    phone: row.phone,
    fullName: row.fullName,
    roles,
    role: roles.includes("ADMIN") ? "ADMIN" : roles.includes("MANAGER") ? "MANAGER" : roles.includes("SUBAGENT") ? "SUBAGENT" : "CLIENT",
  };
}

function writeCookie(token: string) {
  setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
}

export function clearSessionCookie() {
  setCookie(COOKIE, "", { path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0 });
}

export async function readSheetSessionToken(token: string | null | undefined) {
  if (!sheetsConfigured() || !token) return null;
  const { verifySessionToken } = await import("@/lib/google/session");
  const session = verifySessionToken(token);
  if (!session) return null;
  const { readSheetRows } = await import("@/lib/google/sheets");
  const rows = await readSheetRows("Users");
  const row = rows.find((item) => item.id === session.userId);
  if (!row || row.isActive === "false") return null;
  return publicUser(row);
}

export async function readSheetSessionUser() {
  return readSheetSessionToken(getCookie(COOKIE));
}

type AccountInput = { action: "register" | "login"; email: string; password: string; fullName?: string; phone?: string };

export async function runAccountAuth(data: AccountInput) {
  if (!sheetsConfigured()) return { mode: "local" as const };
  if (data.password.trim().length < 8) throw new Error("Password must be at least 8 characters long.");
  const { appendSheetRow, readSheetRows, updateSheetRowById } = await import("@/lib/google/sheets");
  const { createSessionToken, hashPassword, verifyPassword } = await import("@/lib/google/session");
  const { sendSafeTelegramAlert } = await import("@/lib/google/telegram");
  const rows = await readSheetRows("Users");

  if (data.action === "register") {
    const email = emailOf(data.email);
    const phone = phoneOf(data.phone ?? "");
    if (!email.includes("@")) throw new Error("A valid email is required.");
    if (!data.fullName) throw new Error("Full name is required.");
    if (phone.replace(/\D/g, "").length < 7) throw new Error("A valid phone number is required.");
    const live = rows.filter((row) => row.isActive !== "false");
    if (live.some((row) => emailOf(row.email) === email)) throw new Error("User with this email already exists.");
    if (live.some((row) => phoneOf(row.phone) === phone)) throw new Error("User with this phone already exists.");
    const hasAdmin = live.some((row) => withOwner(emailOf(row.email), rolesOf(row.roles)).includes("ADMIN"));
    const roles = withOwner(email, hasAdmin ? ["CLIENT"] : ["ADMIN"]);
    const now = new Date().toISOString();
    const id = `USR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    const record = {
      id,
      email,
      phone,
      fullName: data.fullName,
      roles: JSON.stringify(roles),
      passwordHash: hashPassword(data.password),
      createdAt: now,
      lastLoginAt: now,
      isActive: "true",
    };
    await appendSheetRow("Users", record);
    writeCookie(createSessionToken({ userId: id, email, roles }));
    await sendSafeTelegramAlert(`New registration\n${data.fullName}\n${email}`);
    return { mode: "google" as const, user: publicUser(record) };
  }

  const email = emailOf(data.email);
  const phone = phoneOf(data.email);
  const row = rows.find((item) => emailOf(item.email) === email || (phone && phoneOf(item.phone) === phone));
  if (!row || row.isActive === "false") throw new Error("Invalid email/phone or password.");
  if (!verifyPassword(data.password, row.passwordHash)) throw new Error("Invalid email/phone or password.");
  const user = publicUser(row);
  const lastLoginAt = new Date().toISOString();
  await updateSheetRowById("Users", row.id, { ...row, roles: JSON.stringify(user.roles), lastLoginAt });
  writeCookie(createSessionToken({ userId: user.id, email: user.email, roles: user.roles }));
  return { mode: "google" as const, user: { ...user, lastLoginAt } };
}
