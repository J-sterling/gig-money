// The AI model, reached through OpenRouter (free tier). One setting picks the
// model. A daily cap keeps a public demo inside the free limits (N9).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export function modelConfig(env = process.env) {
  return {
    apiKey: env.OPENROUTER_API_KEY ?? "",
    modelId: env.MODEL || DEFAULT_MODEL,
    dailyLimit: Number(env.MODEL_DAILY_LIMIT ?? 40),
  };
}

export function createModel({ apiKey, modelId }) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY must be set in .env (see README: Model).");
  return createOpenRouter({ apiKey, appName: "Gig Money" })(modelId);
}

// Counts model calls per UTC day in a small JSON file.
export function createDailyCap(limit, path = "var/model-usage.json", today = () => new Date().toISOString().slice(0, 10)) {
  const read = () => {
    const u = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    return u.day === today() ? u : { day: today(), calls: 0 };
  };
  return {
    used: () => read().calls,
    take() {
      const u = read();
      if (u.calls >= limit) throw new Error(`Daily model limit reached (${limit} calls). It resets at midnight UTC.`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ day: u.day, calls: u.calls + 1 }));
    },
  };
}
