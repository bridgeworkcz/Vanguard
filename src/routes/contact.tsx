import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/vg/public";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact · Vanguard" },
      { name: "description", content: "Address, WhatsApp, and email of the Prague office." },
    ],
  }),
  component: ContactPage,
});
