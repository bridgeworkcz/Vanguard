import { createFileRoute } from "@tanstack/react-router";
import { WallPage } from "@/components/vg/round-pages";

export const Route = createFileRoute("/wall")({
  component: WallPage,
});
