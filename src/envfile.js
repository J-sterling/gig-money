// Set one KEY=value line in .env, keeping every other line.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function setEnvVar(key, value, path = ".env") {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const kept = lines.filter((l) => !l.startsWith(`${key}=`) && l !== "");
  writeFileSync(path, [...kept, `${key}=${value}`].join("\n") + "\n", { mode: 0o600 });
}
