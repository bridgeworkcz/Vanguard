import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/vg/public";

export const Route = createFileRoute("/r/$code")({
  component: function AgentRoute() {
    const { code } = Route.useParams();
    const clean = decodeURIComponent(code).trim().slice(0, 120);
    return <HomePage pinnedAgent={clean} />;
  },
});
