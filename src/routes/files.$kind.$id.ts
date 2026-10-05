import { createFileRoute } from "@tanstack/react-router";
import { storedDriveId } from "@/lib/vanguard/files";

export const Route = createFileRoute("/files/$kind/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const kind = params.kind === "team" ? "team" : params.kind === "gallery" ? "gallery" : "";
        if (!kind) return new Response(null, { status: 404 });
        const { readSheetRows } = await import("@/lib/google/sheets");
        const { downloadFileFromDrive } = await import("@/lib/google/drive");
        const rows = await readSheetRows(kind === "team" ? "Team" : "Gallery");
        const row = rows.find((item) => item.id === params.id);
        if (!row || row.isActive === "false") return new Response(null, { status: 404 });
        const fileId = storedDriveId(kind === "team" ? row.photoUrl : row.imageUrl);
        if (!fileId) return new Response(null, { status: 404 });
        try {
          if (fileId.startsWith("docs/")) {
            const { downloadPrivateDocument } = await import("@/lib/blob");
            const file = await downloadPrivateDocument(fileId);
            return new Response(new Uint8Array(file.buffer), {
              headers: {
                "content-type": file.contentType || "application/octet-stream",
                "cache-control": "public, max-age=86400, s-maxage=86400",
                "x-content-type-options": "nosniff",
              },
            });
          }
          const file = await downloadFileFromDrive(fileId);
          return new Response(new Uint8Array(file.buffer), {
            headers: {
              "content-type": file.mimeType || "application/octet-stream",
              "cache-control": "public, max-age=86400, s-maxage=86400",
              "x-content-type-options": "nosniff",
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
