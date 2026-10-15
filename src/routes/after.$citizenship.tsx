import { createFileRoute } from "@tanstack/react-router";
import { AfterPage } from "@/components/vg/round-pages";

export const Route = createFileRoute("/after/$citizenship")({
  component: function AfterRoute() {
    const { citizenship } = Route.useParams();
    return <AfterPage citizenship={citizenship} />;
  },
});
