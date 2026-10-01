import { createFileRoute } from "@tanstack/react-router";
import { CountryPage } from "@/components/vg/public";

export const Route = createFileRoute("/country/$code")({
  component: function CountryRoute() {
    const { code } = Route.useParams();
    return <CountryPage code={code} />;
  },
});
