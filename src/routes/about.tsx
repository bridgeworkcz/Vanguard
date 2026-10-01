import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/vg/public";

export const Route = createFileRoute("/about")({ component: AboutPage });
