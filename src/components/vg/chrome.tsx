import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/lib/auth/client";
import { accountSession, accountSignOut } from "@/lib/vanguard/account";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPublicSite, getSessionProfile, listMyApplications } from "@/lib/vanguard/api";
import { whatsAppHref, countrySlug } from "@/lib/vanguard/domain";
import { useI18n, softenError, type Lang } from "@/lib/vanguard/i18n";
import { stageTone } from "@/lib/vanguard/ops";
import { applyDesktop, desktopOn, toggleDesktop } from "@/lib/vanguard/desk-view";

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

type PublicSite = Awaited<ReturnType<typeof getPublicSite>>;

let siteCache: PublicSite | null = null;
let roleCache: string | null = null;
let sheetCache: boolean | null = null;

export function useSite() {
  const { t } = useI18n();
  const [data, setData] = useState<PublicSite | null>(siteCache);
  const [error, setError] = useState("");
  const reload = () => {
    setError("");
    return getPublicSite()
      .then((value) => {
        siteCache = value;
        setData(value);
        return value;
      })
      .catch((e: unknown) => {
        setError(softenError(e instanceof Error ? e.message : "Error", t("sheets_busy")));
        return null;
      });
  };
  useEffect(() => {
    if (siteCache) setData(siteCache);
    void reload();
  }, []);
  return { data, error, reload };
}

export function useDesk() {
  const auth = useCurrentUserState();
  const [sheet, setSheet] = useState<boolean | null>(sheetCache);
  useEffect(() => {
    let live = true;
    accountSession()
      .then((row) => {
        if (!live) return;
        sheetCache = Boolean(row);
        setSheet(sheetCache);
      })
      .catch(() => {
        if (!live) return;
        sheetCache = false;
        setSheet(false);
      });
    return () => {
      live = false;
    };
  }, [auth.user?.id]);
  const pending = sheet === null && !auth.user;
  const signedIn = Boolean(auth.user) || sheet === true;
  return { pending, signedIn, user: auth.user, deskId: auth.user?.id ?? (signedIn ? "sheet" : "") };
}

function PromoBanner({
  site,
  lang,
}: {
  site: ReturnType<typeof useSite>["data"];
  lang: Lang;
}) {
  const settings = site?.settings;
  if (!settings || settings.banner_on !== "1") return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (settings.banner_start && today < settings.banner_start) return null;
  if (settings.banner_end && today > settings.banner_end) return null;
  const text = settings[`banner_text_${lang}`] || settings.banner_text_en || "";
  const image = site?.media.find((item) => item.kind === "banner" && item.imageData);
  if (!text && !image) return null;
  const body = (
    <>
      {image?.imageData ? <img src={image.imageData} alt="" /> : null}
      {text ? <b>{text}</b> : null}
    </>
  );
  if (settings.banner_country) {
    return (
      <Link to="/country/$code" params={{ code: countrySlug(settings.banner_country) }} className="promo-bar">
        {body}
      </Link>
    );
  }
  return <div className="promo-bar">{body}</div>;
}

function rememberStage(id: string, status: string, stage: number) {
  try {
    const key = "vg-stage-seen";
    const seen = JSON.parse(localStorage.getItem(key) || "{}") as Record<string, string>;
    seen[id] = `${status}:${stage}`;
    localStorage.setItem(key, JSON.stringify(seen));
    window.dispatchEvent(new Event("vg-stage-seen"));
  } catch {
    /* storage unavailable */
  }
}

function CaseNudge({ signedIn, staff }: { signedIn: boolean; staff: boolean }) {
  const { t } = useI18n();
  const [note, setNote] = useState<{ id: string; status: string; stage: number } | null>(null);
  useEffect(() => {
    if (!signedIn || staff) {
      setNote(null);
      return;
    }
    let stop = false;
    const read = () => {
      listMyApplications()
        .then((rows) => {
          if (stop) return;
          const key = "vg-stage-seen";
          let seen: Record<string, string> = {};
          let fresh = true;
          try {
            const raw = localStorage.getItem(key);
            fresh = raw === null;
            seen = raw ? (JSON.parse(raw) as Record<string, string>) : {};
          } catch {
            seen = {};
          }
          const next: Record<string, string> = {};
          let changed: { id: string; status: string; stage: number } | null = null;
          for (const row of rows) {
            const mark = `${row.status}:${row.stage}`;
            next[row.id] = mark;
            if (!fresh && seen[row.id] !== mark) changed = { id: row.id, status: row.status, stage: row.stage };
          }
          if (fresh || !changed) {
            try {
              localStorage.setItem(key, JSON.stringify({ ...seen, ...next }));
            } catch {
              /* ignore */
            }
            if (!changed) setNote(null);
          } else {
            setNote(changed);
          }
        })
        .catch(() => undefined);
    };
    read();
    window.addEventListener("vg-stage-seen", read);
    return () => {
      stop = true;
      window.removeEventListener("vg-stage-seen", read);
    };
  }, [signedIn, staff]);
  if (!note) return null;
  return (
    <div className="border-b border-white/10 bg-white/[0.04]">
      <Link
        to="/portal"
        search={{ id: note.id }}
        className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 text-sm"
        onClick={() => rememberStage(note.id, note.status, note.stage)}
      >
        <span className={stageTone(note.status, note.stage)}>{t("nudge_moved")}</span>
        <span className="ember">{t("nudge_open")}</span>
      </Link>
    </div>
  );
}

export function Shell({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "light" }) {
  const { t, lang, setLang } = useI18n();
  const { data: site } = useSite();
  const { user, pending, signedIn, deskId } = useDesk();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [role, setRole] = useState<string | null>(roleCache);
  const [signingOut, setSigningOut] = useState(false);
  const [desk, setDesk] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const gate = typeof window !== "undefined" && hasGateSessionMarker();
  useLayoutEffect(() => {
    const on = desktopOn();
    setDesk(on);
    applyDesktop(on);
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>("[data-active='true']");
    if (!nav || !current) return;
    const left = current.offsetLeft - 16;
    const right = current.offsetLeft + current.offsetWidth + 16;
    const viewLeft = nav.scrollLeft;
    const viewRight = viewLeft + nav.clientWidth;
    if (left >= viewLeft && right <= viewRight) return;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [path, lang]);
  useEffect(() => {
    if (!signedIn) {
      roleCache = null;
      setRole(null);
      return;
    }
    if (roleCache) setRole(roleCache);
    getSessionProfile()
      .then((p) => {
        roleCache = p.role;
        setRole(p.role);
      })
      .catch(() => {
        roleCache = null;
        setRole(null);
      });
  }, [deskId, signedIn]);
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; disableVerticalSwipes?: () => void } } }).Telegram?.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
  }, []);
  const staff = role === "ADMIN" || role === "MANAGER";
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
      <header className="sticky top-0 z-30 overflow-x-clip border-b border-white/10 bg-[rgba(8,9,10,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl min-w-0 items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-4">
          <Link to="/" className="inline-flex min-h-11 min-w-0 items-center gap-2">
            <Mark className="size-8 shrink-0 sm:size-9" />
            <span className="min-w-0 leading-tight">
              <span className="wordmark block truncate">{t("brand")}</span>
              <span className="ember mt-0.5 hidden text-[8px] tracking-[0.18em] uppercase sm:block">{t("brand_sub")}</span>
            </span>
          </Link>
          <div className="ms-auto flex min-w-0 items-center justify-end gap-1 sm:gap-2">
            {(["en", "cs", "ur"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`lang-code inline-flex h-7 min-w-7 items-center justify-center rounded-[10px] border border-white/15 px-1.5 text-[10px] tracking-[0.08em] sm:h-8 sm:px-2 sm:text-[11px] ${lang === code ? "bg-white/10 text-white" : "text-[#aaa]"}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
            <div className="grid min-h-8 min-w-0 place-items-center">
              {!pending && !signedIn ? (
                <Link to="/login" className="sign-pill max-w-[5.5rem] truncate sm:max-w-none">
                  {t("nav_sign_in")}
                </Link>
              ) : null}
              {signedIn && !gate ? (
                <button
                  type="button"
                  className={`max-w-[5.5rem] truncate px-1 text-xs underline-offset-4 hover:underline sm:max-w-none sm:px-2 sm:text-sm ${tone === "light" ? "text-ink/70" : "text-mist"}`}
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
        </div>
        <nav ref={navRef} className="nav-scroll mx-auto flex max-w-6xl gap-x-4 overflow-x-auto px-4 pb-2 pt-1">
          {item("/", t("nav_home"))}
          {item("/about", t("nav_about"))}
          {item("/filings", t("nav_filings"))}
          {item("/questions", t("nav_questions"))}
          {item("/agents", t("nav_agents"))}
          {item("/contact", t("nav_contact"))}
          {signedIn && role && !staff ? item("/portal", t("nav_portal")) : null}
          {staff ? item("/admin", t("nav_console")) : null}
          <button type="button" className="min-h-11 shrink-0 text-sm text-mist" onClick={() => toggleDesktop()}>
            {desk ? t("view_phone") : t("view_desktop")}
          </button>
        </nav>
      </header>
      <PromoBanner site={site} lang={lang} />
      <CaseNudge signedIn={signedIn} staff={staff} />
      <div className="vg-page">{children}</div>
      <footer className={`border-t px-4 pb-24 pt-8 ${tone === "light" ? "border-ink/10" : "border-white/10"}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="latin text-sm font-bold tracking-[0.16em] uppercase">Vanguard</p>
            <p className={`mt-2 max-w-md text-sm ${tone === "light" ? "text-ink/60" : "text-mist"}`}>{t("footer_note")}</p>
          </div>
          <p className={`latin text-xs ${tone === "light" ? "text-ink/40" : "text-mist"}`}>© 2024 Vanguard Global Mobility s.r.o.</p>
        </div>
      </footer>
      {site?.settings.support_phone ? (
        <a
          href={whatsAppHref(site.settings.support_phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-fab fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center rounded-full bg-[#ff6a1a] px-4 text-sm font-bold text-[#1a0b04] shadow-lg"
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
