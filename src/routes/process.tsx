import { createFileRoute } from "@tanstack/react-router";
import { ProcessPage } from "@/components/vg/pages";

export const Route = createFileRoute("/process")({ component: ProcessPage });
