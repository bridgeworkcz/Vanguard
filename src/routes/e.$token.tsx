import { createFileRoute } from "@tanstack/react-router";
import { EmployerPage } from "@/components/vg/round-pages";

export const Route = createFileRoute("/e/$token")({
  component: function EmployerRoute() {
    const { token } = Route.useParams();
    return <EmployerPage token={token} />;
  },
});
