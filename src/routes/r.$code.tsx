import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { rememberAgent } from "@/components/vg/chrome";

export const Route = createFileRoute("/r/$code")({
  component: function AgentRoute() {
    const { code } = Route.useParams();
    const navigate = useNavigate();
    useEffect(() => {
      const clean = decodeURIComponent(code).trim().slice(0, 120);
      if (clean) rememberAgent(clean);
      void navigate({ to: "/", hash: "calc" });
    }, [code, navigate]);
    return null;
  },
});