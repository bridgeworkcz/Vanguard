import { createFileRoute } from "@tanstack/react-router";
import { FilingsPage } from "@/components/vg/pages";

export const Route = createFileRoute("/filings")({ component: FilingsPage });
