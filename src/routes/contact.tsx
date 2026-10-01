import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/vg/public";

export const Route = createFileRoute("/contact")({ component: ContactPage });
