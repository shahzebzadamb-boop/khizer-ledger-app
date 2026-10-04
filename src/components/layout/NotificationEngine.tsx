"use client";

import { useEffect, useRef } from "react";
import {
  dueReminders,
  karachiNow,
  nightSummaryText,
  notifyBrowser,
  pendingNotice,
} from "@/lib/notifications";
import { useLedger } from "@/lib/store";

export function NotificationEngine() {
  const { state, persist, ready } = useLedger();
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const stamp = karachiNow();
      const due = dueReminders(state);
      for (const item of due) {
        const key = `${item.stayId}:${stamp.cycleDate}:${stamp.hour}`;
        if (sent.current.has(key)) continue;
        sent.current.add(key);
        notifyBrowser("KHIZER LEDGER", pendingNotice(item));
      }
      if (stamp.hour === 5 && !state.nightSummaryDates.includes(stamp.cycleDate)) {
        notifyBrowser("Tonight", nightSummaryText(state));
        void persist({ type: "MARK_NIGHT_SUMMARY", cycleDate: stamp.cycleDate });
      }
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [persist, ready, state]);

  return null;
}
