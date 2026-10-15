import { createFileRoute } from "@tanstack/react-router";
import { GoPage } from "@/components/vg/round-pages";

export const Route = createFileRoute("/go/$slug")({
  component: function GoRoute() {
    const { slug } = Route.useParams();
    return <GoPage slug={slug} />;
  },
});
