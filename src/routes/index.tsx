import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/vg/public";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vanguard Global Mobility" },
      { name: "description", content: "Work-permit filings from a Prague office. The fee is fixed before you choose an opening." },
    ],
  }),
  component: HomePage,
});
