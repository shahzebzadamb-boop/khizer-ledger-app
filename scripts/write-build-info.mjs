import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function gitShortSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function appVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

const builtAt = new Date().toISOString();
const commit = gitShortSha() || `build-${builtAt.slice(0, 19).replace(/[-:T]/g, "")}`;
const info = {
  app: "khizer-ledger",
  commit,
  builtAt,
  version: appVersion(),
};

const generatedDir = join(root, "src", "generated");
mkdirSync(generatedDir, { recursive: true });
const json = `${JSON.stringify(info, null, 2)}\n`;
writeFileSync(join(generatedDir, "build-info.json"), json);
