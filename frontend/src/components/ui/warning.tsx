import { AlertTriangle } from "lucide-react";

export function Warning({ text, testId }: { readonly text: string; readonly testId?: string }) {
  return (
    <p
      className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11.5px] leading-5 text-warning"
      data-testid={testId}
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
