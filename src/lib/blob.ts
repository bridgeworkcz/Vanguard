import { put, get, del, head } from "@vercel/blob";

const MAX_BYTES = 2_500_000;

export type BlobUploadResult = {
  pathname: string;
  url: string;
  contentType: string;
  size: number;
};

/**
 * Upload a private document to Vercel Blob.
 * Returns pathname (store this in DB/Sheets) — never expose the raw url for private blobs.
 */
export async function uploadPrivateDocument(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer | string,
  contentType: string,
): Promise<BlobUploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const blob = await put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    pathname: blob.pathname,
    url: blob.url,
    contentType: blob.contentType || contentType,
    size: typeof body === "string" ? Buffer.byteLength(body) : (body as Buffer).length,
  };
}

/**
 * Download a private document as a Buffer + metadata.
 */
export async function downloadPrivateDocument(pathname: string): Promise<{
  buffer: Buffer;
  contentType: string;
  size: number;
}> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  // head first to get metadata, then get the stream
  const meta = await head(pathname, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const result = await get(pathname, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  if (!result) {
    throw new Error("Blob not found");
  }

  // result can be a ReadableStream or similar depending on SDK version
  const stream = "stream" in result ? result.stream : result;
  const chunks: Uint8Array[] = [];
  const reader = (stream as ReadableStream).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    contentType: meta.contentType || "application/octet-stream",
    size: meta.size || buffer.length,
  };
}

export async function deletePrivateDocument(pathname: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
}

/** Build a consistent pathname for client documents */
export function documentPathname(
  applicationId: string,
  category: string,
  fileName: string,
): string {
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._\-\u0400-\u04FF]/g, "_")
    .slice(0, 120);
  const stamp = Date.now().toString(36);
  return `docs/${applicationId}/${category}/${stamp}-${safeName}`;
}

export { MAX_BYTES };
