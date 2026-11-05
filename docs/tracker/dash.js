// Stand-in for the claude.ai dashboard runtime, so index.html runs as a
// plain page (GitHub Pages or any static server). Same API the page uses:
// dash.calc, dash.data, dash.onData, dash.setLink, dash.colors.
(() => {
  const FILES = {
    acceptance: "acceptance.json",
    software_assets: "software_assets.json",
    bills: "bills.json",
    finops_plan: "plan.json",
    design_docs: "design_docs.json",
  };
  const state = {};
  const calcs = [];
  const listeners = [];
  for (const k of Object.keys(FILES)) state[k] = { status: "loading", data: null };

  function runCalcs() {
    for (const { name, inputs, fn } of calcs) {
      const ins = inputs.map((i) => state[i]);
      if (ins.some((s) => s.status === "error")) state[name] = { status: "error", data: null };
      else if (ins.some((s) => s.status !== "ok")) state[name] = { status: "loading", data: null };
      else {
        try { state[name] = { status: "ok", data: fn(...ins.map((s) => s.data)) }; }
        catch (err) { console.error(`dash calc ${name}:`, err); state[name] = { status: "error", data: null }; }
      }
    }
  }

  function notify() { runCalcs(); listeners.forEach((f) => f()); }

  window.dash = {
    colors: ["#2f6fb2", "#c2410c", "#15803d", "#7c3aed"],
    calc(name, def) { calcs.push({ name, inputs: def.inputs, fn: def.fn }); state[name] = { status: "loading", data: null }; },
    data(name) { return state[name] ?? { status: "error", data: null }; },
    onData(f) { listeners.push(f); f(); },
    setLink(id) { history.replaceState(null, "", "#" + id); },
  };

  const loads = Object.entries(FILES).map(async ([name, file]) => {
    try {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      state[name] = { status: "ok", data: await res.json() };
    } catch (err) {
      console.error(err);
      state[name] = { status: "error", data: null };
    }
  });
  Promise.all(loads).then(() => {
    const failed = Object.keys(FILES).filter((k) => state[k].status === "error");
    const note = document.getElementById("load-note");
    if (note) { note.hidden = !failed.length; note.textContent = failed.length ? `Failed to load: ${failed.join(", ")}` : ""; }
    notify();
  });
  addEventListener("resize", () => listeners.forEach((f) => f()));
})();
