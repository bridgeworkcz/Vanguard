import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/lib/auth/client";
import { accountSession, accountSignOut } from "@/lib/vanguard/account";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPublicSite, getSessionProfile } from "@/lib/vanguard/api";
import { whatsAppHref } from "@/lib/vanguard/domain";
import { useI18n, type Lang } from "@/lib/vanguard/i18n";

export function Mark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      className={`grid place-items-center rounded-xl bg-gradient-to-br from-white to-[#8f8f8f] text-[#070809] ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="size-[68%]">
        <path fill="currentColor" d="M4.5 7.2h3.1v17.6H4.5z" />
        <path fill="currentColor" d="M11 7.2 19.2 16 11 24.8v-3.7L15.6 16 11 10.9zm9 0L29.2 16 20 24.8v-3.7L24.6 16 20 10.9z" />
      </svg>
    </span>
  );
}

export function useSite() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPublicSite>> | null>(null);
  const [error, setError] = useState("");
  const reload = () => {
    setError("");
    getPublicSite()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Error"));
  };
  useEffect(() => {
    reload();
  }, []);
  return { data, error, reload };
}

export function useDesk() {
  const auth = useCurrentUserState();
  const [sheet, setSheet] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    accountSession()
      .then((row) => {
        if (live) setSheet(Boolean(row));
      })
      .catch(() => {
        if (live) setSheet(false);
      });
    return () => {
      live = false;
    };
  }, [auth.user?.id]);
  const pending = auth.isPending || sheet === null;
  const signedIn = Boolean(auth.user) || sheet === true;
  return { pending, signedIn, user: auth.user, deskId: auth.user?.id ?? (signedIn ? "sheet" : "") };
}

export function Shell({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "light" }) {
  const { t, lang, setLang } = useI18n();
  const { data: site } = useSite();
  const { user, pending, signedIn, deskId } = useDesk();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [role, setRole] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const gate = typeof window !== "undefined" && hasGateSessionMarker();
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>("[data-active='true']");
    if (!nav || !current) return;
    const left = current.offsetLeft - nav.offsetLeft - 16;
    nav.scrollTo({ left: Math.max(0, left) });
  }, [path, lang]);
  useEffect(() => {
    if (!signedIn) {
      setRole(null);
      return;
    }
    getSessionProfile()
      .then((p) => setRole(p.role))
      .catch(() => setRole(null));
  }, [deskId, signedIn]);
  const item = (to: "/" | "/about" | "/contact" | "/filings" | "/questions" | "/agents" | "/portal" | "/admin", label: string) => (
    <Link
      to={to}
      className={`min-h-11 inline-flex shrink-0 items-center border-b-2 text-sm ${path === to ? "border-[#ff6a1a] text-paper" : "border-transparent text-mist"} ${tone === "light" && path !== to ? "text-ink/60" : ""} ${tone === "light" && path === to ? "text-ink" : ""}`}
      data-active={path === to ? "true" : "false"}
    >
      {label}
    </Link>
  );
  return (
    <div className={`relative z-[1] ${tone === "light" ? "paper min-h-screen" : "min-h-screen text-paper"}`}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(8,9,10,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3">
          <Link to="/" className="inline-flex min-h-11 shrink-0 items-center gap-2.5">
            <Mark className="size-9" />
            <span className="leading-tight">
              <span className="wordmark block">{t("brand")}</span>
              <span className="ember mt-0.5 block text-[8px] tracking-[0.18em] uppercase">{t("brand_sub")}</span>
            </span>
          </Link>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
            {(["en", "cs", "ur"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`lang-code min-h-8 rounded-[10px] border border-white/15 px-2 text-[11px] tracking-[0.12em] ${lang === code ? "bg-white/10 text-white" : "text-[#aaa]"}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
            {site?.settings.support_phone ? (
              <a
                href={whatsAppHref(site.settings.support_phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="wa-fab inline-flex min-h-8 items-center rounded-full bg-[#ff6a1a] px-2.5 text-[11px] font-bold text-[#1a0b04] sm:hidden"
              >
                {t("wa_label")}
              </a>
            ) : null}
            {!pending && !signedIn ? (
              <Link to="/login" className="sign-pill">
                {t("nav_sign_in")}
              </Link>
            ) : null}
            {signedIn && !gate ? (
              <button
                type="button"
                className={`min-h-11 px-2 text-sm underline-offset-4 hover:underline ${tone === "light" ? "text-ink/70" : "text-mist"}`}
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  try {
                    sessionStorage.removeItem("grok-auth.bearer-token");
                  } catch {
                    /* storage unavailable */
                  }
                  const leave = accountSignOut()
                    .catch(() => undefined)
                    .then(() => {
                      if (!user) return;
                      return signOut();
                    });
                  void Promise.race([leave.catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, 1600))]).then(() => {
                    window.location.assign("/");
                  });
                }}
              >
                {signingOut ? t("signing_out") : t("sign_out")}
              </button>
            ) : null}
          </div>
        </div>
        <nav ref={navRef} className="nav-scroll mx-auto flex max-w-6xl gap-x-4 overflow-x-auto px-4 pb-2 pt-1">
          {item("/", t("nav_home"))}
          {item("/about", t("nav_about"))}
          {item("/filings", t("nav_filings"))}
          {item("/questions", t("nav_questions"))}
          {item("/agents", t("nav_agents"))}
          {item("/contact", t("nav_contact"))}
          {signedIn ? item("/portal", t("nav_portal")) : null}
          {role === "ADMIN" || role === "MANAGER" ? item("/admin", t("nav_console")) : null}
        </nav>
      </header>
      <div className="vg-page">{children}</div>
      <footer className={`border-t px-4 pb-8 pt-8 sm:pb-24 ${tone === "light" ? "border-ink/10" : "border-white/10"}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="latin text-sm font-bold tracking-[0.16em] uppercase">Vanguard</p>
            <p className={`mt-2 max-w-md text-sm ${tone === "light" ? "text-ink/60" : "text-mist"}`}>{t("footer_note")}</p>
          </div>
          <p className={`latin text-xs ${tone === "light" ? "text-ink/40" : "text-mist"}`}>© {new Date().getFullYear()} Vanguard Global Mobility s.r.o.</p>
        </div>
      </footer>
      {site?.settings.support_phone ? (
        <a
          href={whatsAppHref(site.settings.support_phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-fab fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 hidden min-h-12 items-center rounded-full bg-[#ff6a1a] px-4 text-sm font-bold text-[#1a0b04] shadow-lg sm:inline-flex"
        >
          {t("wa_label")}
        </a>
      ) : null}
    </div>
  );
}

export function storyKey(lang: Lang, kind: "hero_title" | "hero_body" | "about_lead" | "about_story") {
  return `${kind}_${lang}`;
}
