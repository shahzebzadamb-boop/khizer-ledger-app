"use client";

import { useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;

type VersionPayload = {
  commit?: string;
};

function isEditableField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function isIgnoredInput(el: HTMLInputElement) {
  return ["checkbox", "radio", "hidden", "button", "submit", "reset", "file", "range", "color"].includes(el.type);
}

function hasUnsavedFormWork() {
  const active = document.activeElement;
  if (isEditableField(active) && document.hasFocus()) {
    if (!(active instanceof HTMLInputElement) || !isIgnoredInput(active)) {
      if (String(active.value ?? "").length > 0) return true;
    }
  }
  for (const el of document.querySelectorAll("input, textarea")) {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) continue;
    if (el instanceof HTMLInputElement && (isIgnoredInput(el) || el.type === "date" || el.type === "number")) continue;
    if (String(el.value ?? "").trim() !== "") return true;
  }
  return false;
}

export function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const knownCommitRef = useRef<string | null>(null);
  const userRequestedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    function markUpdate() {
      if (!cancelled) setUpdateReady(true);
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        registrationRef.current = registration;
        if (registration.waiting && navigator.serviceWorker.controller) markUpdate();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              markUpdate();
            }
          });
        });
      })
      .catch(() => undefined);

    function onControllerChange() {
      if (!userRequestedRef.current) {
        markUpdate();
        return;
      }
      if (hasUnsavedFormWork()) {
        markUpdate();
        return;
      }
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    async function checkVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as VersionPayload;
        const commit = typeof data.commit === "string" ? data.commit : "";
        if (!commit) return;
        if (knownCommitRef.current && knownCommitRef.current !== commit) markUpdate();
        knownCommitRef.current = commit;
      } catch {
        // version checks are best-effort
      }
    }

    void checkVersion();
    const interval = window.setInterval(() => {
      void registrationRef.current?.update();
      void checkVersion();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  function applyUpdate() {
    if (hasUnsavedFormWork()) return;
    userRequestedRef.current = true;
    const waiting = registrationRef.current?.waiting;
    if (waiting) {
      waiting.postMessage("SKIP_WAITING");
      return;
    }
    window.location.reload();
  }

  if (!updateReady) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface px-3 py-1.5 shadow-sm">
        <p className="text-[11px] font-normal text-muted">New version available</p>
        <button
          type="button"
          className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium text-background"
          onClick={applyUpdate}
        >
          Update
        </button>
      </div>
    </div>
  );
}
