// Shows this OpenRouter key's limits and usage, and which free models support tools. Prints no secrets.
import "../src/config.js"; // loads .env
import { modelConfig } from "../src/model.js";

const mc = modelConfig();
try {
  if (!mc.apiKey) throw new Error("OPENROUTER_API_KEY must be set in .env (see README: Model).");
  const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${mc.apiKey}` } });
  if (!res.ok) throw new Error(`OpenRouter rejected the key: HTTP ${res.status}`);
  const { data: k } = await res.json();
  console.log(`Key OK. Free tier: ${k.is_free_tier}. Usage today: ${k.usage_daily ?? "n/a"}. Credit limit: ${k.limit ?? "none"}.`);
  const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data;
  const free = models.filter((m) => m.id.endsWith(":free") && m.supported_parameters?.includes("tools"));
  const chosen = free.some((m) => m.id === mc.modelId);
  console.log(`Model ${mc.modelId}: ${chosen ? "available, free, supports tools" : "NOT in the free tool-capable list"}.`);
  console.log(`App cap: ${mc.dailyLimit} calls a day (MODEL_DAILY_LIMIT).`);
  if (!chosen) console.log("Free models with tool support:\n  " + free.map((m) => m.id).join("\n  "));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
