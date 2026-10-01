import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/papers")({
  beforeLoad: () => {
    throw redirect({ to: "/questions", hash: "papers", replace: true });
  },
});
