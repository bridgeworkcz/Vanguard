import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "x-dns-prefetch-control": "off",
  };
  if (process.env.NODE_ENV === "production") {
    headers["strict-transport-security"] = "max-age=15552000; includeSubDomains";
    headers["x-frame-options"] = "DENY";
    headers["content-security-policy"] = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline'",
      "frame-src 'self' https://maps.google.com https://www.google.com https://www.google.com/maps",
      "connect-src 'self'",
    ].join("; ");
  }
  for (const [name, value] of Object.entries(headers)) setResponseHeader(name, value);
  return next();
});

export const startInstance = createStart(() => {
  const csrf = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === "serverFn",
    allowRequestsWithoutOriginCheck: true,
  });
  return { requestMiddleware: [securityHeaders, csrf] };
});
