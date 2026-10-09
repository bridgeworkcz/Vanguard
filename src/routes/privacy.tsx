import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/vg/public";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · Vanguard" },
      { name: "description", content: "What the office keeps, and why." },
    ],
  }),
  component: function PrivacyRoute() {
    return <LegalPage kind="privacy" />;
  },
});
