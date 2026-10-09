import { createFileRoute } from "@tanstack/react-router";
import { FilingsPage } from "@/components/vg/pages";

export const Route = createFileRoute("/filings")({
  head: () => ({
    meta: [
      { title: "Openings · Vanguard" },
      { name: "description", content: "Countries and permits the office prepares." },
    ],
  }),
  component: FilingsPage,
});
