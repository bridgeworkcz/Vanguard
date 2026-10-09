import { createFileRoute } from "@tanstack/react-router";
import { QuestionsPage } from "@/components/vg/pages";

export const Route = createFileRoute("/questions")({
  head: () => ({
    meta: [
      { title: "Questions · Vanguard" },
      { name: "description", content: "How a filing moves, what the fee covers, and how payment works." },
    ],
  }),
  component: QuestionsPage,
});
