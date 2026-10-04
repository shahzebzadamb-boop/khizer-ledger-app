"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { NotificationEngine } from "@/components/layout/NotificationEngine";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const calculator = pathname === "/calculator";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg min-w-0 bg-background">
      <main className={calculator ? "min-h-dvh px-0 pb-0 pt-0" : "px-4 pb-32 pt-4"}>{children}</main>
      {calculator ? null : <BottomNav />}
      {calculator ? null : <NotificationEngine />}
      <ServiceWorkerRegister />
    </div>
  );
}
