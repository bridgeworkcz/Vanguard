import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/vg/public";

export const Route = createFileRoute("/")({ component: HomePage });
