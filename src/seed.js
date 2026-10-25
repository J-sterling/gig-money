// A month of made-up income for a new demo workspace (N10: synthetic data only).
// Payer names are invented; amounts are typical of each kind of gig.
const PLAN = [
  // [days ago, source, payer, note, amount]
  [1, "Delivery app", "Delivery app weekly payout", "Week 43 deliveries", "186.40"],
  [3, "Craft shop", "M. Okafor", "Print: Hebden Bridge at dusk (A3)", "28.00"],
  [5, "Photography", "Northside Café", "Menu photos, half day", "150.00"],
  [8, "Delivery app", "Delivery app weekly payout", "Week 42 deliveries", "201.15"],
  [9, "Craft shop", "J. Whitfield", "Print set of 3 (A4)", "45.00"],
  [12, "Craft shop", "R. Patel", "Print: Calder Valley (A4)", "18.00"],
  [15, "Delivery app", "Delivery app weekly payout", "Week 41 deliveries", "172.90"],
  [18, "Photography", "Brightside Yoga", "Class photos", "95.00"],
  [22, "Delivery app", "Delivery app weekly payout", "Week 40 deliveries", "194.25"],
  [25, "Craft shop", "S. Lindqvist", "Print: Stoodley Pike (A3)", "28.00"],
];

export function seedWorkspace(ledger, workspaceId, now = new Date()) {
  PLAN.forEach(([daysAgo, source, payer, note, amount], i) => {
    const at = new Date(now.getTime() - daysAgo * 864e5);
    ledger.addSeed(workspaceId, {
      id: `SEED-${workspaceId}-${i}`, amount_pence: Math.round(Number(amount) * 100), currency: "GBP",
      payer, note, source, source_by: "seed", captured_at: at.toISOString(),
    });
  });
  return PLAN.length;
}
