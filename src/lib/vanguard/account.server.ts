import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { databaseUrl } from "@/lib/database-url";
import { limited } from "./guard";

const COOKIE = "vg_session";

export function sheetsConfigured(): boolean {
  if (databaseUrl()) return false;
  return Boolean(process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim());
}

export function officeAuth(): boolean {
  return Boolean(databaseUrl()) || Boolean(process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim());
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

function publicUser(row: Record<string, string>) {
  const email = emailOf(row.email);
  const roles = rolesOf(row.roles);
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
  try {
    const rows = await readSheetRows("Users");
    const row = rows.find((item) => item.id === session.userId);
    if (!row || row.isActive === "false") return null;
    return publicUser(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!/busy|unavailable|429/i.test(message)) throw err;
    const roles = session.roles.length ? session.roles : ["CLIENT"];
    return {
      id: session.userId,
      email: session.email,
      phone: "",
      fullName: session.email,
      roles,
      role: roles.includes("ADMIN") ? "ADMIN" : roles.includes("MANAGER") ? "MANAGER" : roles.includes("SUBAGENT") ? "SUBAGENT" : "CLIENT",
    } as ReturnType<typeof publicUser>;
  }
}

export async function readOfficeUser() {
  if (databaseUrl()) return readDatabaseSessionUser();
  return readSheetSessionUser();
}

async function readDatabaseSessionUser() {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const { verifySessionToken } = await import("@/lib/google/session");
  const session = verifySessionToken(token);
  if (!session) return null;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    email: string;
    phone: string;
    fullName: string;
    roles: string;
    isActive: boolean;
  }>`select id, email, phone, full_name as "fullName", roles, is_active as "isActive" from office_users where id = ${session.userId}`;
  const row = rows[0];
  if (!row || row.isActive === false) return null;
  return publicUser({
    id: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.fullName,
    roles: row.roles,
  });
}

async function registerInDatabase(data: AccountInput) {
  const { getSql } = await import("@/lib/db");
  const { createSessionToken, hashPassword } = await import("@/lib/google/session");
  const sql = await getSql();
  const email = emailOf(data.email);
  const phone = phoneOf(data.phone ?? "");
  if (!email.includes("@")) throw new Error("A valid email is required.");
  if (!data.fullName) throw new Error("Full name is required.");
  if (phone.replace(/\D/g, "").length < 7) throw new Error("A valid phone number is required.");
  const same = await sql<{ id: string; isActive: boolean }>`select id, is_active as "isActive" from office_users where lower(email) = ${email}`;
  if (same.some((row) => row.isActive !== false)) throw new Error("User with this email already exists.");
  if (same.length) throw new Error("This email is closed. Ask the office to open it again.");
  const phones = await sql<{ id: string }>`select id from office_users where phone = ${phone} and is_active = true limit 1`;
  if (phones.length) throw new Error("User with this phone already exists.");
  const admins = await sql<{ c: number }>`select count(*)::int as c from office_users where is_active = true and roles like '%ADMIN%'`;
  const roles = Number(admins[0]?.c ?? 0) > 0 ? ["CLIENT"] : ["ADMIN"];
  const id = `USR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  const passwordHash = hashPassword(data.password);
  const role = roles.includes("ADMIN") ? "ADMIN" : "CLIENT";
  await sql`insert into office_users (id, email, phone, full_name, roles, password_hash, is_active)
    values (${id}, ${email}, ${phone}, ${data.fullName}, ${JSON.stringify(roles)}, ${passwordHash}, true)`;
  await sql`insert into profiles (user_id, email, full_name, phone, role)
    values (${id}, ${email}, ${data.fullName}, ${phone}, ${role})
    on conflict (user_id) do update set email = ${email}, full_name = ${data.fullName}, phone = ${phone}, role = ${role}`;
  writeCookie(createSessionToken({ userId: id, email, roles }));
  return publicUser({ id, email, phone, fullName: data.fullName, roles: JSON.stringify(roles) });
}

async function loginInDatabase(data: AccountInput) {
  const { getSql } = await import("@/lib/db");
  const { createSessionToken, verifyPassword } = await import("@/lib/google/session");
  const sql = await getSql();
  const email = emailOf(data.email);
  const phone = phoneOf(data.email);
  const rows = await sql<{
    id: string;
    email: string;
    phone: string;
    fullName: string;
    roles: string;
    passwordHash: string;
    isActive: boolean;
  }>`select id, email, phone, full_name as "fullName", roles, password_hash as "passwordHash", is_active as "isActive"
    from office_users where lower(email) = ${email} or (${phone} <> '' and phone = ${phone}) limit 1`;
  const row = rows[0];
  if (!row || row.isActive === false) throw new Error("Invalid email/phone or password.");
  if (!verifyPassword(data.password, row.passwordHash)) throw new Error("Invalid email/phone or password.");
  const user = publicUser({ id: row.id, email: row.email, phone: row.phone, fullName: row.fullName, roles: row.roles });
  await sql`update office_users set last_login_at = now() where id = ${row.id}`;
  writeCookie(createSessionToken({ userId: user.id, email: user.email, roles: user.roles }));
  return user;
}

export async function readSheetSessionUser() {
  return readSheetSessionToken(getCookie(COOKIE));
}

type AccountInput = { action: "register" | "login"; email: string; password: string; fullName?: string; phone?: string };

export async function runAccountAuth(data: AccountInput) {
  assertSameSiteRequest();
  if (databaseUrl()) {
    const req = getRequest();
    const ip = (req?.headers.get("x-forwarded-for") || "local").split(",")[0]?.trim().slice(0, 80) || "local";
    const emailKey = emailOf(data.email).slice(0, 120);
    if (data.action === "register") {
      if (limited(`register:${ip}`, 5, 60 * 60 * 1000)) throw new Error("Try again later.");
    } else if (limited(`login:${emailKey}`, 8, 15 * 60 * 1000) || limited(`login-ip:${ip}`, 30, 15 * 60 * 1000)) {
      throw new Error("Try again later.");
    }
    if (data.password.trim().length < 8) throw new Error("Password must be at least 8 characters long.");
    const user = data.action === "register" ? await registerInDatabase(data) : await loginInDatabase(data);
    return { mode: "google" as const, user };
  }
  if (!sheetsConfigured()) return { mode: "local" as const };
  const req = getRequest();
  const ip = (req?.headers.get("x-forwarded-for") || "local").split(",")[0]?.trim().slice(0, 80) || "local";
  const emailKey = emailOf(data.email).slice(0, 120);
  if (data.action === "register") {
    if (limited(`register:${ip}`, 5, 60 * 60 * 1000)) throw new Error("Try again later.");
  } else if (limited(`login:${emailKey}`, 8, 15 * 60 * 1000) || limited(`login-ip:${ip}`, 30, 15 * 60 * 1000)) {
    throw new Error("Try again later.");
  }
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
    const sameEmail = rows.filter((row) => emailOf(row.email) === email);
    if (sameEmail.some((row) => row.isActive !== "false")) throw new Error("User with this email already exists.");
    if (sameEmail.length) throw new Error("This email is closed. Ask the office to open it again.");
    const live = rows.filter((row) => row.isActive !== "false");
    if (live.some((row) => phoneOf(row.phone) === phone)) throw new Error("User with this phone already exists.");
    const hasAdmin = live.some((row) => rolesOf(row.roles).includes("ADMIN"));
    const roles = hasAdmin ? ["CLIENT"] : ["ADMIN"];
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
