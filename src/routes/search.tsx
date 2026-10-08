import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "@/components/vg/public";

type Search = { citizenship: string; country: string; product: string; speed: string; employer: string };

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    citizenship: typeof search.citizenship === "string" ? search.citizenship : "",
    country: typeof search.country === "string" ? search.country : "",
    product: typeof search.product === "string" ? search.product : "",
    speed: typeof search.speed === "string" ? search.speed : "",
    employer: typeof search.employer === "string" ? search.employer : "",
  }),
  component: function SearchRoute() {
    const s = Route.useSearch();
    return <SearchPage {...s} />;
  },
});
