import { createFileRoute } from "@tanstack/react-router";
import { FromPage } from "@/components/vg/public";

export const Route = createFileRoute("/from/$citizenship/$country")({
  component: function FromRoute() {
    const { citizenship, country } = Route.useParams();
    return <FromPage citizenship={citizenship} country={country} />;
  },
});
