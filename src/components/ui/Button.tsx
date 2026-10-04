import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-on-primary",
        variant === "secondary" && "border border-border bg-input text-foreground",
        variant === "ghost" && "bg-transparent text-secondary",
        variant === "danger" && "bg-danger text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
