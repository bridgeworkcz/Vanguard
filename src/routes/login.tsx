import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { accountAuth, accountBackend } from "@/lib/vanguard/account";
import { completePasswordReset, requestPasswordReset } from "@/lib/vanguard/api";
import { useI18n, softenError } from "@/lib/vanguard/i18n";
import { Shell, usePageMeta } from "@/components/vg/chrome";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Vanguard" },
      { name: "description", content: "Open your case, or create an account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t, lang } = useI18n();
  usePageMeta("seo_login_title", "seo_login_desc");
  const [mode, setMode] = useState<"in" | "up" | "forgot" | "reset">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    accountBackend()
      .then((row) => setSheet(row.kind === "sheet"))
      .catch(() => setSheet(false));
    const token = new URLSearchParams(window.location.search).get("reset") || "";
    if (/^[a-f0-9]{64}$/i.test(token)) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setNote("");
    if (mode !== "forgot" && password.length < 8) {
      setErr(t("login_short"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const result = await requestPasswordReset({ data: { email, lang } });
        setNote(result.sent ? t("login_reset_sent") : t("login_reset_nomail"));
        setBusy(false);
        return;
      }
      if (mode === "reset") {
        await completePasswordReset({ data: { token: resetToken, password } });
        setNote(t("login_reset_done"));
        setMode("in");
        setPassword("");
        setBusy(false);
        return;
      }
      const account = await accountAuth({
        data: {
          action: mode === "up" ? "register" : "login",
          email,
          password,
          fullName: name,
          phone,
        },
      });
      if (account.mode === "local") {
        if (mode === "up") {
          const res = await authClient.signUp.email({ email, password, name: name || email });
          if (res.error) throw new Error(res.error.message || "Error");
          const token = res.data?.token;
          if (token) sessionStorage.setItem("grok-auth.bearer-token", token);
        } else {
          const res = await authClient.signIn.email({ email, password });
          if (res.error) throw new Error(res.error.message || "Error");
          const token = res.data?.token;
          if (token) sessionStorage.setItem("grok-auth.bearer-token", token);
        }
      }
      window.location.assign("/portal");
    } catch (error) {
      const raw = error instanceof Error ? error.message : t("login_error");
      setErr(raw === "Expired" ? t("login_reset_bad") : raw === "Short" ? t("login_short") : softenError(raw, t("sheets_busy")));
      setBusy(false);
    }
  }

  const title = mode === "forgot" || mode === "reset" ? t("login_reset_title") : t("login_title");

  return (
    <Shell>
      <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-16">
        <div className="glass w-full p-6">
          <p className="kicker">{t("login_kicker")}</p>
          <h1 className="display mt-3 text-4xl">{title}</h1>
          {mode === "forgot" ? <p className="mt-3 text-sm text-mist">{t("login_reset_help")}</p> : null}
          <form className="mt-6 grid gap-3" onSubmit={(e) => void submit(e)}>
            {mode === "up" ? (
              <>
                <input className="field" placeholder={t("login_name")} value={name} onChange={(e) => setName(e.target.value)} />
                <input className="field" placeholder={t("contact_phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </>
            ) : null}
            {mode === "reset" ? null : (
              <input className="field" type="email" required placeholder={t("login_email")} value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
            {mode === "forgot" ? null : (
              <input className="field" type="password" required placeholder={mode === "reset" ? t("login_reset_new") : t("login_password")} value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
            {mode === "up" ? (
              <p className="text-sm text-mist">
                {t("login_terms")}{" "}
                <Link to="/terms" className="text-paper underline-offset-4 hover:underline">{t("terms_nav")}</Link>
                {" · "}
                <Link to="/privacy" className="text-paper underline-offset-4 hover:underline">{t("privacy_nav")}</Link>
              </p>
            ) : null}
            {err ? <p className="text-sm text-metal">{err}</p> : null}
            {note ? <p className="text-sm text-mist">{note}</p> : null}
            <button className="btn-solid" type="submit" disabled={busy}>
              {mode === "up" ? t("login_create") : mode === "forgot" ? t("login_reset_title") : mode === "reset" ? t("login_reset_save") : t("login_enter")}
            </button>
          </form>
          {mode === "in" ? (
            <button type="button" className="mt-4 text-sm text-mist" onClick={() => { setMode("forgot"); setErr(""); setNote(""); }}>
              {t("login_forgot")}
            </button>
          ) : null}
          <button type="button" className="mt-4 block text-sm text-mist" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); setNote(""); }}>
            {mode === "in" ? t("login_switch_create") : t("login_switch_have")}
          </button>
          {sheet || mode !== "in" ? null : (
            <>
              <p className="mt-6 text-center text-xs uppercase tracking-widest text-mist">{t("login_or")}</p>
              <div className="mt-3 grid gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <button key={p.providerId} type="button" className="btn" onClick={() => signIn(p.providerId, { callbackURL: "/portal" })}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </Shell>
  );
}