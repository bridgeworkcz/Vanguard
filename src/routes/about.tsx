import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/vg/public";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "The office · Vanguard" },
      { name: "description", content: "Prague office, the company record, and the employers we file with." },
    ],
  }),
  component: AboutPage,
});
