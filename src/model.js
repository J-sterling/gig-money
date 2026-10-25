// The AI model, reached through OpenRouter (free tier). One setting picks the
// model. A daily cap keeps a public demo inside the free limits (N9).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Free endpoints come and go, so MODEL is a comma-separated list: OpenRouter
// tries them in order within one request (one call against the cap).
// (nemotron-3-super-120b-a12b:free was failing upstream on 25 Oct, so it's left out.)
export const DEFAULT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
];
export const DEFAULT_MODEL = DEFAULT_MODELS[0];

export function modelConfig(env = process.env) {
  const models = (env.MODEL || DEFAULT_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);
  return {
    apiKey: env.OPENROUTER_API_KEY ?? "",
    modelId: models[0],
    models,
    dailyLimit: Number(env.MODEL_DAILY_LIMIT ?? 40),
    // Free endpoints queue unpredictably (4-60 s seen on 25 Oct), so give up
    // after this and let the caller show a saved draft instead.
    timeoutMs: Number(env.MODEL_TIMEOUT_MS ?? 20000),
    reasoning: env.MODEL_REASONING || "none",
  };
}

export function createModel({ apiKey, modelId, models = [modelId], reasoning = "none" }) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY must be set in .env (see README: Model).");
  // Reasoning off: a draft is simple extraction, and it cut one call from 35 s to 4 s.
  return createOpenRouter({ apiKey, appName: "Gig Money" })(modelId, {
    models: models.slice(0, 3), reasoning: { effort: reasoning, exclude: true },
  });
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
