import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "@/lib/auth/client";
import { accountSignOut } from "@/lib/vanguard/account";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPublicSite, getSessionProfile } from "@/lib/vanguard/api";
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

export function Shell({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "light" }) {
  const { t, lang, setLang } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [role, setRole] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const gate = typeof window !== "undefined" && hasGateSessionMarker();
  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    getSessionProfile()
      .then((p) => setRole(p.role))
      .catch(() => setRole(null));
  }, [user?.id]);
  const item = (to: "/" | "/about" | "/contact" | "/portal" | "/admin", label: string) => (
    <Link
      to={to}
      className={`min-h-11 inline-flex items-center text-sm ${path === to ? "text-paper" : "text-mist"} ${tone === "light" && path !== to ? "text-ink/60" : ""} ${tone === "light" && path === to ? "text-ink" : ""}`}
    >
      {label}
    </Link>
  );
  return (
    <div className={`relative z-[1] ${tone === "light" ? "paper min-h-screen" : "min-h-screen text-paper"}`}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(8,9,10,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2.5">
            <Mark className="size-9" />
            <span className="leading-tight">
              <span className="wordmark block">{t("brand")}</span>
              <span className="ember mt-0.5 block text-[8px] tracking-[0.18em] uppercase">{t("brand_sub")}</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4">
            {item("/", t("nav_home"))}
            {item("/about", t("nav_about"))}
            {item("/contact", t("nav_contact"))}
            {user ? item("/portal", t("nav_portal")) : null}
            {role === "ADMIN" || role === "MANAGER" ? item("/admin", t("nav_console")) : null}
          </nav>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {(["en", "cs", "ur"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-h-8 rounded-[10px] border border-white/15 px-2 text-[11px] tracking-[0.12em] ${lang === code ? "bg-white/10 text-white" : "text-[#aaa]"}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
            {!isPending && !user ? (
              <Link to="/login" className="sign-pill">
                {t("nav_sign_in")}
              </Link>
            ) : null}
            {user && !gate ? (
              <button
                type="button"
                className={`min-h-11 px-2 text-sm underline-offset-4 hover:underline ${tone === "light" ? "text-ink/70" : "text-mist"}`}
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void accountSignOut()
                    .catch(() => undefined)
                    .then(() => signOut())
                    .catch(() => {
                      window.location.assign("/");
                    });
                }}
              >
                {signingOut ? t("signing_out") : t("sign_out")}
              </button>
            ) : null}
          </div>
        </div>
      </header>
      {children}
      <footer className={`border-t px-4 py-8 ${tone === "light" ? "border-ink/10" : "border-white/10"}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[0.16em] uppercase">Vanguard</p>
            <p className={`mt-2 max-w-md text-sm ${tone === "light" ? "text-ink/60" : "text-mist"}`}>{t("footer_note")}</p>
          </div>
          <p className={`text-xs ${tone === "light" ? "text-ink/40" : "text-mist"}`}>© {new Date().getFullYear()} Vanguard Global Mobility s.r.o.</p>
        </div>
      </footer>
    </div>
  );
}

export function storyKey(lang: Lang, kind: "hero_title" | "hero_body" | "about_lead" | "about_story") {
  return `${kind}_${lang}`;
}
