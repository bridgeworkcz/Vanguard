import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/components/vg/pages";

export const Route = createFileRoute("/agents")({ component: AgentsPage });
