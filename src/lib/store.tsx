"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { emptyLedgerState } from "@/lib/empty-state";
import { normalizeState, type Action } from "@/lib/ledger-actions";
import type { LedgerState } from "@/types";

type LedgerContextValue = {
  state: LedgerState;
  dispatch: (action: Action) => void;
  persist: (action: Action) => Promise<LedgerState>;
  ready: boolean;
  reload: () => Promise<void>;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LedgerState>(emptyLedgerState);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/ledger", { cache: "no-store" });
      if (!response.ok) {
        setState(emptyLedgerState());
        return;
      }
      const data = (await response.json()) as { state: LedgerState };
      setState(normalizeState(data.state));
    } catch {
      setState(emptyLedgerState());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = useCallback(async (action: Action) => {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!response.ok) {
      throw new Error("Save failed");
    }
    const data = (await response.json()) as { state: LedgerState };
    const next = normalizeState(data.state);
    setState(next);
    return next;
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === "HYDRATE") {
        setState(normalizeState(action.payload));
        return;
      }
      void persist(action);
    },
    [persist],
  );

  const value = useMemo(
    () => ({ state, dispatch, persist, ready, reload }),
    [state, dispatch, persist, ready, reload],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const context = useContext(LedgerContext);
  if (!context) throw new Error("useLedger must be used within LedgerProvider");
  return context;
}
