"use client";

import { useEffect, useState } from "react";
import { Bell, Smartphone, UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApartmentsSettings } from "@/components/settings/ApartmentsSettings";
import { AppVersionFooter } from "@/components/settings/AppVersionFooter";
import { canUseBrowserNotifications } from "@/lib/notifications";
import { useLedger } from "@/lib/store";

export default function SettingsPage() {
  const { state } = useLedger();
  const receivers = state.receivers.filter((item) => item.active);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Khizer Ledger" />

      <section>
        <p className="kh-group-label">Properties</p>
        <ApartmentsSettings />
      </section>

      <section>
        <p className="kh-group-label">Receivers</p>
        <div className="kh-group">
          {receivers.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-muted">No receivers yet.</p>
          ) : (
            receivers.map((receiver) => (
              <div key={receiver.id} className="flex min-h-14 items-center gap-3 border-b border-border px-3.5 last:border-b-0">
                <UserRound size={18} className="text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{receiver.name}</p>
                  <p className="text-xs text-muted">Payment receiver</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <p className="kh-group-label">Notifications</p>
        <div className="kh-group">
          <NotificationRow />
        </div>
      </section>

      <section>
        <p className="kh-group-label">App</p>
        <div className="kh-group">
          <div className="flex min-h-14 items-center gap-3 px-3.5">
            <Smartphone size={18} className="text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Khizer Ledger</p>
              <p className="text-xs text-muted">Property ledger</p>
            </div>
          </div>
        </div>
        <AppVersionFooter />
      </section>
    </div>
  );
}

function NotificationRow() {
  const [permission, setPermission] = useState<string>("default");

  useEffect(() => {
    if (!canUseBrowserNotifications()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  return (
    <button
      type="button"
      className="flex min-h-14 w-full items-center gap-3 px-3.5 text-left"
      onClick={() => {
        if (!canUseBrowserNotifications()) return;
        void Notification.requestPermission().then(setPermission);
      }}
    >
      <Bell size={18} className="text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Reminders</span>
        <span className="block text-xs text-muted">
          {permission === "granted" ? "Enabled" : permission === "unsupported" ? "Not available" : "Tap to enable"}
        </span>
      </span>
      <span className="text-muted">›</span>
    </button>
  );
}
