import { createServerFn } from "@tanstack/react-start";

type AccountInput = { action: "register" | "login"; email: string; password: string; fullName?: string; phone?: string };

export const accountSession = createServerFn({ method: "GET" }).handler(async () => {
  const { sheetsConfigured, readSheetSessionUser } = await import("./account.server");
  if (!sheetsConfigured()) return null;
  return readSheetSessionUser();
});

export const accountSignOut = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSessionCookie } = await import("./account.server");
  clearSessionCookie();
  return { ok: true };
});

export const accountAuth = createServerFn({ method: "POST" })
  .validator((input: AccountInput) => ({
    action: input?.action === "register" ? ("register" as const) : ("login" as const),
    email: String(input?.email ?? "").trim(),
    password: String(input?.password ?? ""),
    fullName: String(input?.fullName ?? "").trim(),
    phone: String(input?.phone ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    const { runAccountAuth } = await import("./account.server");
    return runAccountAuth(data);
  });
