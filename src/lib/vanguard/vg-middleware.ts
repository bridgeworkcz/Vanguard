import { createMiddleware } from "@tanstack/react-start";

export const vgMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const { readSheetSessionUser, sheetsConfigured } = await import("./account.server");
    if (sheetsConfigured()) {
      const sheetUser = await readSheetSessionUser();
      if (!sheetUser) throw new Error("Unauthorized");
      return next({ context: { userId: sheetUser.id } });
    }
    const { requireUserId } = await import("@/lib/auth/verify.server");
    const userId = await requireUserId(context.bearerToken);
    return next({ context: { userId } });
  });
