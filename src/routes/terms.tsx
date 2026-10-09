import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/vg/public";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms · Vanguard" },
      { name: "description", content: "What the office does, what it does not, and how the fee is split." },
    ],
  }),
  component: function TermsRoute() {
    return <LegalPage kind="terms" />;
  },
});
