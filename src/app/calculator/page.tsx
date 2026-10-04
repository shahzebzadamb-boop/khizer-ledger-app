"use client";

import Link from "next/link";
import { CalculatorPad } from "@/components/calculator/CalculatorPad";

export default function CalculatorPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/?entry=1"
          className="inline-flex min-h-11 items-center text-sm font-medium text-secondary"
        >
          Close
        </Link>
        <p className="text-sm font-medium text-muted">Calculator</p>
        <span className="inline-block w-12" />
      </div>
      <CalculatorPad />
    </div>
  );
}
