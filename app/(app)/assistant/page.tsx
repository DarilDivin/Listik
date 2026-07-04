import { Sparkles } from "lucide-react";
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export default function AssistantPage() {
  return (
    <SectionPlaceholder
      icon={Sparkles}
      title="Assistant"
      description="L'assistant IA (questions sur tes tâches et notes, actions en langage naturel) arrive bientôt."
      phase="Phase D"
    />
  );
}
