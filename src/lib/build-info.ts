import generated from "../generated/build-info.json";

export type BuildInfo = {
  app: string;
  commit: string;
  builtAt: string;
  version?: string;
};

export function getBuildInfo(): BuildInfo {
  return {
    app: generated.app || "khizer-ledger",
    commit: generated.commit || generated.builtAt || "unknown",
    builtAt: generated.builtAt,
    version: generated.version,
  };
}
