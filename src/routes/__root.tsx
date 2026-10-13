import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LanguageProvider } from "@/lib/vanguard/i18n";
import appCss from "../styles.css?url";

function TapAck() {
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const node = event.target instanceof Element
        ? event.target.closest("button.btn, a.btn, button.btn-solid, a.btn-solid, .btn-ink, .sign-pill, .admin-nav-btn, label.btn")
        : null;
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(":disabled") || node.getAttribute("aria-disabled") === "true") return;
      node.classList.remove("tap-ack");
      void node.offsetWidth;
      node.classList.add("tap-ack");
      const clear = () => node.classList.remove("tap-ack");
      node.addEventListener("animationend", clear, { once: true });
      window.setTimeout(clear, 520);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vanguard Global Mobility" },
      { name: "description", content: "Work-permit filings from a Prague office. The fee is fixed before you choose an opening." },
      { name: "referrer", content: "strict-origin-when-cross-origin" },
      { name: "theme-color", content: "#070809" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=optional",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("vg-desk")==="1"){var m=document.querySelector('meta[name="viewport"]');if(m)m.setAttribute("content","width=1280")}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <PreviewHostBridge />
        <TapAck />
        <AuthProvider>
          <LanguageProvider>
            <Outlet />
          </LanguageProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
