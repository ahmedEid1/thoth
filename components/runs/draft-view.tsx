import { Card } from "@/components/ui/card";

export function DraftView({ draft }: { draft: string }) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-3">Draft review</h3>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{draft}</pre>
    </Card>
  );
}
