import { createFileRoute } from "@tanstack/react-router";
import { storedDriveId } from "@/lib/vanguard/files";

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
        const row = rows.find((item) => item.id === decodeURIComponent(params.id));
        if (!row) return new Response(null, { status: 404 });
        const stored = (kind === "team" ? row.photoUrl || row.photo || "" : row.imageUrl || "").trim();
        if (stored.startsWith("http://") || stored.startsWith("https://")) {
          return new Response(null, { status: 302, headers: { location: stored } });
        }
        const fileId = storedDriveId(stored);
        if (!fileId) return new Response(null, { status: 404 });
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
