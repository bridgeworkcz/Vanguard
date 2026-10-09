export async function deliverMail(opts: { key: string; from: string; to: string; subject: string; text: string }) {
  const key = opts.key.trim();
  const from = opts.from.trim();
  const to = opts.to.trim();
  if (!key || !from.includes("@") || !to.includes("@")) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: opts.subject.slice(0, 180), text: opts.text.slice(0, 4000) }),
    });
    if (!res.ok) console.error("[mail]", res.status);
    return res.ok;
  } catch (err) {
    console.error("[mail]", err);
    return false;
  }
}

export const RESET_LINK = "https://www.vanguardmobility.site/login?reset=";
