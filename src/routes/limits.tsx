import { createFileRoute } from "@tanstack/react-router";
import { LimitsPage } from "@/components/vg/round-pages";

export const Route = createFileRoute("/limits")({
  component: LimitsPage,
});
