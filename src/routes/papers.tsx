import { createFileRoute } from "@tanstack/react-router";
import { PapersPage } from "@/components/vg/pages";

export const Route = createFileRoute("/papers")({ component: PapersPage });
