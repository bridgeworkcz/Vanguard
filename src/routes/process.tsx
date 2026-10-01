import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/process")({
  beforeLoad: () => {
    throw redirect({ to: "/questions", hash: "path", replace: true });
  },
});
