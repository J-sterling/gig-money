// Tags a payment by starting a Render Workflow run (src/tasks/tag-payment.js)
// rather than calling the model here. Used only when RENDER_TAG_TASK and
// RENDER_WORKFLOW_API_KEY are set (the Render demo); otherwise the app tags
// in-process. Any failure throws, and createTagger falls back to rules.

// A failed run comes back with status "failed" rather than throwing, so only
// "completed" counts. Errors carry the run id, status and error text, nothing more.
export function createRemoteClassify({ workflows, taskSlug, cap, timeoutMs = 60000 }) {
  return async (payment, categories, examples) => {
    cap.take(); // the run makes one model call; count it here, where the cap's file is
    const { payer, note, amount_pence, currency } = payment;
    const run = await workflows.startTask(taskSlug, [{ payer, note, amount_pence, currency }, categories, examples]);
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Render run ${run.taskRunId} took over ${timeoutMs / 1000} s`)), timeoutMs); });
    try {
      const done = await Promise.race([run.get(), late]);
      if (done?.status !== "completed") throw new Error(`Render run ${run.taskRunId} ${done?.status ?? "ended"}: ${done?.error ?? "no result"}`);
      const tag = done.results?.[0];
      if (!tag?.source) throw new Error(`Render run ${run.taskRunId} returned no tag`);
      return { ...tag, reason: `${tag.reason} · Render run ${run.taskRunId}` };
    } catch (err) {
      if (/took over/.test(err.message)) await workflows.cancelTaskRun(run.taskRunId).catch(() => {});
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

// Remote only when both settings are present. RENDER_API_KEY (used by
// scripts/render.sh) never switches it on, so local runs stay in-process.
export function chooseClassify(env, { local, makeRemote }) {
  const taskSlug = env.RENDER_TAG_TASK;
  const token = env.RENDER_WORKFLOW_API_KEY;
  return taskSlug && token ? makeRemote({ taskSlug, token }) : local;
}
