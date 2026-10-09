import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/components/vg/pages";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents · Vanguard" },
      { name: "description", content: "A code for the clients of a sub-agent." },
    ],
  }),
  component: AgentsPage,
});
