import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/vg/admin";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : "overview",
    id: typeof search.id === "string" ? search.id : "",
  }),
  component: function AdminRoute() {
    const { tab, id } = Route.useSearch();
    return <AdminPage tab={tab} id={id} />;
  },
});
