import { del, get, put } from "@vercel/blob";

const MAX_BYTES = 2_500_000;

export type BlobUploadResult = {
  pathname: string;
  url: string;
  contentType: string;
  size: number;
};

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  return token;
}

/**
 * Upload a private document. Callers must store pathname, never the private url.
 */
export async function uploadPrivateDocument(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer | string,
  contentType: string,
  overwrite = false,
): Promise<BlobUploadResult> {
  const blob = await put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    token: blobToken(),
  });
  const size = typeof body === "string" ? Buffer.byteLength(body) : body instanceof Buffer ? body.length : body instanceof ArrayBuffer ? body.byteLength : 0;
  return {
    pathname: blob.pathname,
    url: blob.url,
    contentType: blob.contentType || contentType,
    size,
  };
}

/** A portrait the website shows in public. Store the returned url. */
export async function uploadPublicImage(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer | string,
  contentType: string,
): Promise<BlobUploadResult> {
  const blob = await put(pathname, body, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    token: blobToken(),
  });
  const size = typeof body === "string" ? Buffer.byteLength(body) : body instanceof Buffer ? body.length : body instanceof ArrayBuffer ? body.byteLength : 0;
  return {
    pathname: blob.pathname,
    url: blob.url,
    contentType: blob.contentType || contentType,
    size,
  };
}

/** Read a private document into memory. Pathnames start with docs/. */
export async function downloadPrivateDocument(pathname: string): Promise<{
  buffer: Buffer;
  contentType: string;
  size: number;
}> {
  const result = await get(pathname, { access: "private", token: blobToken() });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Blob not found");
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    contentType: result.blob.contentType || "application/octet-stream",
    size: result.blob.size ?? buffer.length,
  };
}

export async function deletePrivateDocument(pathname: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return;
  await del(pathname, { token });
}

/** Stable private pathname for a client document. */
export function documentPathname(applicationId: string, category: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0400-\u04FF]/g, "_").slice(0, 120) || "file";
  return `docs/${applicationId}/${category}/${Date.now().toString(36)}-${safeName}`;
}

export { MAX_BYTES };
