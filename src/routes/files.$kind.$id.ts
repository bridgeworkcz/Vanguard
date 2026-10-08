import { createFileRoute } from "@tanstack/react-router";
import { storedDriveId } from "@/lib/vanguard/files";

function sheetCell(row: Record<string, string>, names: string[]) {
  const folded = new Map(Object.entries(row).map(([key, value]) => [key.replace(/[\s_]/g, "").toLowerCase(), value]));
  for (const name of names) {
    const value = String(folded.get(name.replace(/[\s_]/g, "").toLowerCase()) ?? "").trim();
    if (value) return value;
  }
  return "";
}
function imageType(pathname: string, fallback: string) {
  const name = pathname.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return fallback.startsWith("image/") ? fallback : "image/jpeg";
}

export const Route = createFileRoute("/files/$kind/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const kind = params.kind === "team" ? "team" : params.kind === "gallery" ? "gallery" : "";
        if (!kind) return new Response(null, { status: 404 });
        const { readSheetRows } = await import("@/lib/google/sheets");
        const { downloadFileFromDrive } = await import("@/lib/google/drive");
        const rows = await readSheetRows(kind === "team" ? "Team" : "Gallery");
        const wanted = decodeURIComponent(params.id);
        const row = rows.find((item) => item.id === wanted || sheetCell(item, ["id"]) === wanted);
        if (!row) return new Response(null, { status: 404 });
        const stored = (kind === "team" ? sheetCell(row, ["photoUrl", "photo"]) : sheetCell(row, ["imageUrl", "image"])).trim();
        if (stored.startsWith("https://")) {
          let dest: URL;
          try {
            dest = new URL(stored);
          } catch {
            return new Response(null, { status: 404 });
          }
          const host = dest.hostname.toLowerCase();
          const google = host === "drive.google.com" || host.endsWith(".googleusercontent.com");
          if (!google) return new Response(null, { status: 404 });
          return new Response(null, { status: 302, headers: { location: dest.toString() } });
        }
        const fileId = storedDriveId(stored);
        const publicDoc = fileId.startsWith("docs/team/") || fileId.startsWith("docs/gallery/");
        if (!fileId || fileId.includes("..") || (fileId.startsWith("docs/") && !publicDoc)) return new Response(null, { status: 404 });
        try {
          if (fileId.startsWith("docs/")) {
            const { downloadPrivateDocument } = await import("@/lib/blob");
            const file = await downloadPrivateDocument(fileId);
            const type = imageType(fileId, file.contentType);
            return new Response(new Uint8Array(file.buffer), {
              headers: {
                "content-type": type,
                "cache-control": "public, max-age=86400, s-maxage=86400",
              },
            });
          }
          const file = await downloadFileFromDrive(fileId);
          return new Response(new Uint8Array(file.buffer), {
            headers: {
              "content-type": imageType(fileId, file.mimeType || ""),
              "cache-control": "public, max-age=86400, s-maxage=86400",
            },
          });
        } catch (err) {
          console.error("[file]", err);
          return new Response(null, { status: 404 });
        }
      },
    },
  },
});
