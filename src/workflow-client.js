// Tags a payment by starting a Render Workflow run (src/tasks/tag-payment.js)
// rather than calling the model here. Used only when RENDER_TAG_TASK and
// RENDER_WORKFLOW_API_KEY are set (the Render demo); otherwise the app tags
// in-process. Any failure throws, and createTagger falls back to rules.

// The SDK's run.get() never returned against the live API (it did locally),
// so this asks for the run's status once a second instead. A parent run is
// "paused" while its model step runs. A failed run comes back as "failed"
// rather than throwing. Errors carry the run id, status and error text only.
const FINISHED = new Set(["completed", "succeeded", "failed", "canceled", "cancelled"]);

export function createRemoteClassify({ workflows, taskSlug, cap, timeoutMs = 60000, pollMs = 1000 }) {
  return async (payment, categories, examples) => {
    cap.take(); // the run makes one model call; count it here, where the cap's file is
    const { payer, note, amount_pence, currency } = payment;
    const run = await workflows.startTask(taskSlug, [{ payer, note, amount_pence, currency }, categories, examples]);
    const id = run.taskRunId;
    const deadline = Date.now() + timeoutMs;
    let done = await workflows.getTaskRun(id);
    while (!FINISHED.has(done?.status)) {
      if (Date.now() >= deadline) {
        await workflows.cancelTaskRun(id).catch(() => {});
        throw new Error(`Render run ${id} took over ${timeoutMs / 1000} s`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      done = await workflows.getTaskRun(id);
    }
    if (done.status !== "completed" && done.status !== "succeeded") throw new Error(`Render run ${id} ${done.status}: ${done.error || "no result"}`);
    const tag = done.results?.[0];
    if (!tag?.source) throw new Error(`Render run ${id} returned no tag`);
    return { ...tag, reason: `${tag.reason} · Render run ${id}` };
  };
}

// Remote only when both settings are present. RENDER_API_KEY (used by
// scripts/render.sh) never switches it on, so local runs stay in-process.
export function chooseClassify(env, { local, makeRemote }) {
  const taskSlug = env.RENDER_TAG_TASK;
  const token = env.RENDER_WORKFLOW_API_KEY;
  return taskSlug && token ? makeRemote({ taskSlug, token }) : local;
}
