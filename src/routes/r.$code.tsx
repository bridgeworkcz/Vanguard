import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shell } from "@/components/vg/chrome";
import { useI18n } from "@/lib/vanguard/i18n";

export const Route = createFileRoute("/r/$code")({
  component: function AgentRoute() {
    const { code } = Route.useParams();
    const { t } = useI18n();
    useEffect(() => {
      const clean = decodeURIComponent(code).trim().slice(0, 120);
      if (clean) sessionStorage.setItem("vg-agent", clean);
    }, [code]);
    return (
      <Shell>
        <article className="mx-auto max-w-3xl px-4 py-14">
          <p className="kicker ember">{t("agents_kicker")}</p>
          <h1 className="display mt-3 text-4xl sm:text-5xl">{t("agents_title")}</h1>
          <p className="mt-6 text-mist">{t("agent_kept")}</p>
          <p className="mt-2 text-mist">{t("agents_3")}</p>
          <p className="latin mt-4 text-sm">{decodeURIComponent(code)}</p>
          <Link to="/" className="btn-solid mt-8 inline-flex items-center">{t("calc_search")}</Link>
        </article>
      </Shell>
    );
  },
});
