// Registering and removing this app's PayPal webhook. Both are safe to re-run.
export const EVENT_TYPES = ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "INVOICING.INVOICE.PAID"];

export const webhookUrl = (base) => `${base.replace(/\/$/, "")}/webhooks/paypal`;

// Returns {id, url, reused}. If PayPal already has this URL, reuses that webhook.
export async function registerWebhook(paypal, base) {
  const url = webhookUrl(base);
  try {
    const hook = await paypal.createWebhook(url, EVENT_TYPES);
    return { id: hook.id, url: hook.url, reused: false };
  } catch (err) {
    if (err.body?.name !== "WEBHOOK_URL_ALREADY_EXISTS") throw err;
    const { webhooks = [] } = await paypal.listWebhooks();
    const hook = webhooks.find((w) => w.url === url);
    if (!hook) throw err;
    return { id: hook.id, url: hook.url, reused: true };
  }
}

// Returns true if a webhook was removed, false if PayPal had no webhook with that ID.
export async function removeWebhook(paypal, id) {
  try {
    await paypal.deleteWebhook(id);
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}
