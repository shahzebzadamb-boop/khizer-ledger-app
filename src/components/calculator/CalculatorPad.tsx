"use client";

import { useCallback, useState } from "react";
import { applyCalcInput, formatCalcDisplay, initialCalcState, type CalcState } from "@/lib/calculator";
import { cn } from "@/lib/utils";

const KEYS = [
  { key: "AC", label: "AC", kind: "util" },
  { key: "+/-", label: "+/−", kind: "util" },
  { key: "%", label: "%", kind: "util" },
  { key: "÷", label: "÷", kind: "op" },
  { key: "7", label: "7", kind: "num" },
  { key: "8", label: "8", kind: "num" },
  { key: "9", label: "9", kind: "num" },
  { key: "×", label: "×", kind: "op" },
  { key: "4", label: "4", kind: "num" },
  { key: "5", label: "5", kind: "num" },
  { key: "6", label: "6", kind: "num" },
  { key: "-", label: "−", kind: "op" },
  { key: "1", label: "1", kind: "num" },
  { key: "2", label: "2", kind: "num" },
  { key: "3", label: "3", kind: "num" },
  { key: "+", label: "+", kind: "op" },
  { key: "0", label: "0", kind: "zero" },
  { key: ".", label: ".", kind: "num" },
  { key: "=", label: "=", kind: "op" },
] as const;

export function CalculatorPad() {
  const [state, setState] = useState<CalcState>(initialCalcState);
  const display = formatCalcDisplay(state);

  const press = useCallback((key: string) => {
    setState((current) => applyCalcInput(current, key));
  }, []);

  return (
    <div className="flex w-full flex-col bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <div className="flex h-36 w-full items-end justify-end py-3">
        <p
          className="w-full text-right font-sans font-light leading-none tracking-tight text-[#f5f5f7] [font-variant-numeric:tabular-nums]"
          style={{ fontSize: display.length > 8 ? "2.4rem" : display.length > 6 ? "2.9rem" : "3.4rem" }}
        >
          {display}
        </p>
      </div>
      <div className="grid w-full grid-cols-4 gap-3">
        {KEYS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            onClick={() => press(item.key)}
            className={cn(
              "flex h-[4.35rem] items-center justify-center rounded-full text-[1.7rem] font-medium text-[#f5f5f7] active:opacity-70",
              item.kind === "zero" && "col-span-2 justify-start pl-8",
              item.kind === "num" && "bg-[#2c3036]",
              item.kind === "zero" && "bg-[#2c3036]",
              item.kind === "util" && "bg-[#5a616c] text-[#111214]",
              item.kind === "op" && "bg-[#e8923a] text-white",
              state.op === item.key && state.fresh && "brightness-125",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
