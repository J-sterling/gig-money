// Minimal PayPal REST client over fetch. Caches the OAuth token until shortly
// before it expires. Every method returns parsed JSON or throws PayPalError.

export class PayPalError extends Error {
  constructor(status, body, what) {
    super(`${what} failed: HTTP ${status}${body?.name ? ` ${body.name}` : ""}${body?.message ? ` - ${body.message}` : ""}`);
    this.status = status;
    this.body = body;
  }
}

export function createPayPal({ baseUrl, clientId, clientSecret, fetch = globalThis.fetch, now = Date.now }) {
  let token = null;
  let expiresAt = 0;

  async function getToken() {
    if (token && now() < expiresAt) return { token, expiresAt };
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new PayPalError(res.status, { name: body.error, message: body.error_description }, "Getting an OAuth token");
    token = body.access_token;
    expiresAt = now() + (body.expires_in - 60) * 1000; // refresh a minute early
    return { token, expiresAt };
  }

  async function call(method, path, what, payload, rawBody) {
    const { token: t } = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: rawBody ?? (payload === undefined ? undefined : JSON.stringify(payload)),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw new PayPalError(res.status, body, what);
    return body;
  }

  return {
    getToken,
    listWebhooks: () => call("GET", "/v1/notifications/webhooks", "Listing webhooks"),
    createWebhook: (url, eventTypes) =>
      call("POST", "/v1/notifications/webhooks", "Registering the webhook", {
        url,
        event_types: eventTypes.map((name) => ({ name })),
      }),
    createOrder: ({ value, currency = "GBP", returnUrl, cancelUrl }) =>
      call("POST", "/v2/checkout/orders", "Creating the order", {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: currency, value } }],
        payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl } } },
      }),
    captureOrder: (id) => call("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, "Capturing the order", {}),
    // PayPal compares the event byte for byte, so the raw body is spliced in
    // rather than re-serialised.
    verifyWebhook: ({ headers, rawBody, webhookId }) =>
      call(
        "POST",
        "/v1/notifications/verify-webhook-signature",
        "Verifying the webhook",
        undefined,
        `{"auth_algo":${JSON.stringify(headers["paypal-auth-algo"] ?? "")},` +
          `"cert_url":${JSON.stringify(headers["paypal-cert-url"] ?? "")},` +
          `"transmission_id":${JSON.stringify(headers["paypal-transmission-id"] ?? "")},` +
          `"transmission_sig":${JSON.stringify(headers["paypal-transmission-sig"] ?? "")},` +
          `"transmission_time":${JSON.stringify(headers["paypal-transmission-time"] ?? "")},` +
          `"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${rawBody}}`,
      ).then((r) => r.verification_status === "SUCCESS"),
  };
}
