export type CalcOp = "+" | "-" | "×" | "÷";

export type CalcState = {
  display: string;
  acc: number | null;
  op: CalcOp | null;
  last: number | null;
  fresh: boolean;
  error: boolean;
};

const MAX_CHARS = 12;

export function initialCalcState(): CalcState {
  return {
    display: "0",
    acc: null,
    op: null,
    last: null,
    fresh: true,
    error: false,
  };
}

export function formatCalcDisplay(state: CalcState): string {
  if (state.error) return "Error";
  return state.display;
}

function parseDisplay(display: string): number {
  const value = Number(display);
  return Number.isFinite(value) ? value : NaN;
}

export function stringifyCalc(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e10) / 1e10;
  if (Object.is(rounded, -0)) return "0";
  let text = String(rounded);
  if (text.includes("e") || text.includes("E")) {
    text = rounded.toPrecision(10);
  }
  if (text.length > MAX_CHARS) {
    text = rounded.toPrecision(8);
  }
  text = text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  if (text === "-0") return "0";
  return text || "0";
}

function compute(left: number, op: CalcOp, right: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
  if (op === "+") return left + right;
  if (op === "-") return left - right;
  if (op === "×") return left * right;
  if (right === 0) return NaN;
  return left / right;
}

function withResult(state: CalcState, value: number): CalcState {
  if (!Number.isFinite(value)) {
    return { ...initialCalcState(), error: true, display: "Error" };
  }
  return {
    ...state,
    display: stringifyCalc(value),
    error: false,
    fresh: true,
  };
}

export function applyCalcInput(state: CalcState, key: string): CalcState {
  if (state.error && key !== "AC") return state;

  if (key === "AC") return initialCalcState();

  if (key === "+/-") {
    if (state.display === "0" || state.display === "Error") return state;
    const next = state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`;
    return { ...state, display: next, fresh: false };
  }

  if (key === "%") {
    const value = parseDisplay(state.display) / 100;
    return withResult({ ...state, acc: null, op: null, last: null }, value);
  }

  if (key === ".") {
    if (state.fresh) return { ...state, display: "0.", fresh: false, error: false };
    if (state.display.includes(".")) return state;
    return { ...state, display: `${state.display}.` };
  }

  if (/^\d$/.test(key)) {
    if (state.fresh || state.display === "0") {
      return { ...state, display: key, fresh: false, error: false };
    }
    if (state.display.replace("-", "").replace(".", "").length >= MAX_CHARS) return state;
    return { ...state, display: `${state.display}${key}` };
  }

  if (key === "=") {
    if (state.op && state.acc !== null) {
      const right = state.fresh && state.last !== null ? state.last : parseDisplay(state.display);
      const result = compute(state.acc, state.op, right);
      return withResult(
        { ...state, acc: Number.isFinite(result) ? result : null, last: right },
        result,
      );
    }
    return { ...state, fresh: true };
  }

  if (key === "+" || key === "-" || key === "×" || key === "÷") {
    const current = parseDisplay(state.display);
    if (state.acc !== null && state.op && !state.fresh) {
      const result = compute(state.acc, state.op, current);
      if (!Number.isFinite(result)) return withResult(state, result);
      return {
        display: stringifyCalc(result),
        acc: result,
        op: key,
        last: current,
        fresh: true,
        error: false,
      };
    }
    return {
      ...state,
      acc: current,
      op: key,
      last: null,
      fresh: true,
    };
  }

  return state;
}
