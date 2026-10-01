import { createFileRoute } from "@tanstack/react-router";
import { QuestionsPage } from "@/components/vg/pages";

export const Route = createFileRoute("/questions")({ component: QuestionsPage });
