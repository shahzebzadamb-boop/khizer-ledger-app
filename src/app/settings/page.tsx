"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { ApartmentsSettings } from "@/components/settings/ApartmentsSettings";
import { AppVersionFooter } from "@/components/settings/AppVersionFooter";

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Apartments used in KHIZER LEDGER" />
      <ApartmentsSettings />
      <AppVersionFooter />
    </div>
  );
}
