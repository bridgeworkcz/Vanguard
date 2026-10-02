import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/google/drive")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = new URL("/admin", url.origin);
        back.searchParams.set("tab", "content");
        const failed = () => {
          back.hash = "drive-fail";
          return Response.redirect(back.toString(), 302);
        };
        const code = url.searchParams.get("code");
        if (!code || url.searchParams.get("error")) return failed();
        try {
          const { readSheetSessionUser } = await import("@/lib/vanguard/account.server");
          const user = await readSheetSessionUser();
          if (!user || user.role !== "ADMIN") return failed();
          const state = url.searchParams.get("state") || "";
          const { finishDriveOAuth } = await import("@/lib/vanguard/sheet-backend");
          await finishDriveOAuth(user.id, code, `${url.origin}/google/drive`, state);
          back.hash = "drive-ok";
          return Response.redirect(back.toString(), 302);
        } catch (err) {
          console.error("[drive] oauth", err);
          return failed();
        }
      },
    },
  },
});
