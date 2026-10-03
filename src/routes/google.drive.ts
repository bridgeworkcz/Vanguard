import { createFileRoute } from "@tanstack/react-router";

function cookieValue(header: string, name: string) {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0 || trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}

function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const proto = (request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https").split(",")[0].trim();
  return `${proto}://${host}`;
}

export const Route = createFileRoute("/google/drive")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = publicOrigin(request);
        const back = new URL("/admin", origin);
        back.searchParams.set("tab", "content");
        const failed = (why: string) => {
          back.hash = why ? `drive-fail-${why}` : "drive-fail";
          return Response.redirect(back.toString(), 302);
        };
        const code = url.searchParams.get("code");
        if (!code || url.searchParams.get("error")) return failed("again");
        try {
          const { readSheetSessionToken } = await import("@/lib/vanguard/account.server");
          const token = cookieValue(request.headers.get("cookie") || "", "vg_session");
          const user = await readSheetSessionToken(token);
          if (!user || user.role !== "ADMIN") return failed("session");
          const state = url.searchParams.get("state") || "";
          const cookieState = cookieValue(request.headers.get("cookie") || "", "vg_drive_state");
          const { finishDriveOAuth } = await import("@/lib/vanguard/sheet-backend");
          await finishDriveOAuth(user.id, code, `${origin}/google/drive`, state, cookieState);
          back.hash = "drive-ok";
          return Response.redirect(back.toString(), 302);
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          console.error("[drive] oauth", message);
          const why = /state/i.test(message)
            ? "state"
            : /redirect_uri/i.test(message)
              ? "redirect"
              : /invalid_client|unauthorized_client/i.test(message)
                ? "secret"
                : "again";
          return failed(why);
        }
      },
    },
  },
});