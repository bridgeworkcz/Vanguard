import { createFileRoute } from "@tanstack/react-router";
import { PortalPage } from "@/components/vg/portal";

export const Route = createFileRoute("/portal")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  component: function PortalRoute() {
    const { id } = Route.useSearch();
    return <PortalPage id={id} />;
  },
});
