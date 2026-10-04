"use client";

import { useEffect, useState } from "react";

type VersionPayload = {
  commit?: string;
};

export function AppVersionFooter() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: VersionPayload | null) => {
        const commit = typeof data?.commit === "string" ? data.commit.trim() : "";
        if (commit) setLabel(commit);
      })
      .catch(() => undefined);
  }, []);

  if (!label) return null;

  return (
    <p className="pt-10 text-center text-[10px] font-normal leading-relaxed tracking-wide text-muted/60">
      App version
      <br />
      {label}
    </p>
  );
}
