import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "danger" | "warning" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "neutral" && "bg-input text-secondary",
        tone === "danger" && "bg-input text-danger",
        tone === "warning" && "bg-input text-warning",
        tone === "success" && "bg-input text-primary",
      )}
    >
      {children}
    </span>
  );
}
