import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { accountAuth, accountBackend } from "@/lib/vanguard/account";
import { useI18n, softenError } from "@/lib/vanguard/i18n";
import { Shell } from "@/components/vg/chrome";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    accountBackend()
      .then((row) => setSheet(row.kind === "sheet"))
      .catch(() => setSheet(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.length < 8) {
      setErr(t("login_short"));
      return;
    }
    setBusy(true);
    try {
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
      setErr(softenError(error instanceof Error ? error.message : t("login_error"), t("sheets_busy")));
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-16">
        <div className="glass w-full p-6">
          <p className="kicker">{t("login_kicker")}</p>
          <h1 className="display mt-3 text-4xl">{t("login_title")}</h1>
          <form className="mt-6 grid gap-3" onSubmit={(e) => void submit(e)}>
            {mode === "up" ? (
              <>
                <input className="field" placeholder={t("login_name")} value={name} onChange={(e) => setName(e.target.value)} />
                <input className="field" placeholder={t("contact_phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </>
            ) : null}
            <input className="field" type="email" required placeholder={t("login_email")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" required placeholder={t("login_password")} value={password} onChange={(e) => setPassword(e.target.value)} />
            {err ? <p className="text-sm text-metal">{err}</p> : null}
            <button className="btn-solid" type="submit" disabled={busy}>
              {mode === "up" ? t("login_create") : t("login_enter")}
            </button>
          </form>
          <button type="button" className="mt-4 text-sm text-mist" onClick={() => setMode(mode === "up" ? "in" : "up")}>
            {mode === "up" ? t("login_switch_have") : t("login_switch_create")}
          </button>
          {sheet ? null : (
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