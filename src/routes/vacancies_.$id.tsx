import { createFileRoute } from "@tanstack/react-router";
import { VacancyPage } from "@/components/vg/public";

type Search = { citizenship: string; product: string; speed: string };

export const Route = createFileRoute("/vacancies_/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    citizenship: typeof search.citizenship === "string" ? search.citizenship : "",
    product: typeof search.product === "string" ? search.product : "",
    speed: typeof search.speed === "string" ? search.speed : "",
  }),
  component: function VacancyRoute() {
    const { id } = Route.useParams();
    const s = Route.useSearch();
    return <VacancyPage id={id} {...s} />;
  },
});
