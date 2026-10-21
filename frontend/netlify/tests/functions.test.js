// Run: cd frontend && node --test netlify/tests
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
process.env.RAZORPAY_KEY_SECRET = "key_secret_test";
const { hmac, safeEq } = require("../functions/_shared/lib");
const webhook = require("../functions/razorpay-webhook");
const verify = require("../functions/razorpay-verify");
const { runQueue, MAX_ATTEMPTS } = require("../functions/_shared/notify");

test("daily stock digest lists only low and sold-out products, most urgent first", () => {
  const { pickItems } = require("../functions/daily-stock-digest");
  const out = pickItems([
    { name: "A", sku: "A", available: 10, low_stock_threshold: 3 },
    { name: "B", sku: "B", available: 2, low_stock_threshold: 3 },
    { name: "C", sku: "C", available: 0, low_stock_threshold: 3 },
    { name: "D", sku: "D", available: 3, low_stock_threshold: 3 },
  ]);
  assert.deepStrictEqual(out.map((i) => i.sku), ["C", "B", "D"]);
});

test("stock digest email renders the product table", () => {
  const { emailHtml } = require("../functions/_shared/notify");
  const html = emailHtml({ n: { event: "stock_digest", audience: "owner", payload: { out: 1, low: 1, items: [{ name: "Ring <x>", sku: "R1", available: 0 }, { name: "Hoop", sku: "H1", available: 2 }] } }, o: null, brand: {}, contact: {} });
  assert.ok(html.includes("Daily stock check") && html.includes("Ring &lt;x&gt;") && html.includes("Sold out") && html.includes("stock=low"));
});

test("payment signature verification matches Razorpay's HMAC-SHA256 scheme", () => {
  const expected = crypto.createHmac("sha256", "key_secret_test").update("order_1|pay_1").digest("hex");
  assert.ok(safeEq(hmac("key_secret_test", "order_1|pay_1"), expected));
  assert.ok(!safeEq(hmac("key_secret_test", "order_1|pay_2"), expected));
  assert.ok(!safeEq("short", expected));
});

test("webhook rejects missing/invalid signatures before touching the database", async () => {
  const r = await webhook.handler({ httpMethod: "POST", headers: { "x-razorpay-signature": "bad" }, body: '{"event":"payment.captured"}' });
  assert.strictEqual(r.statusCode, 401);
  const g = await webhook.handler({ httpMethod: "GET", headers: {}, body: "" });
  assert.strictEqual(g.statusCode, 405);
});

test("verify endpoint refuses a forged checkout signature", async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_x";
  const r = await verify.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ order_number: "IMZ1", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "forged" }) });
  assert.strictEqual(r.statusCode, 400);
  assert.match(JSON.parse(r.body).error, /signature/i);
});

// --- minimal fake Supabase client for the notification queue ---
function fakeDb(rows, settings = {}) {
  const updates = []; const inserts = [];
  const chain = (table, op, payload) => {
    const filters = {};
    const api = {
      select: () => api, eq: (k, v) => { filters[k] = v; return api; }, lte: () => api, order: () => api, limit: () => api, in: () => api,
      maybeSingle: () => Promise.resolve({ data: table === "store_settings" ? { value: settings.notifications } : null }),
      then: (res) => {
        if (table === "notification_logs" && op === "select") return res({ data: rows.filter((r) => r.status === "pending") });
        if (table === "store_settings") return res({ data: [{ key: "brand", value: { name: "IMINATIONZ" } }, { key: "contact", value: {} }] });
        if (op === "update") {
          const row = rows.find((r) => r.id === filters.id);
          if (filters.attempts !== undefined && row.attempts !== filters.attempts) return res({ data: [] });
          Object.assign(row, payload); updates.push({ ...payload }); return res({ data: [row] });
        }
        if (op === "insert") { inserts.push(payload); return res({ data: null }); }
        return res({ data: null });
      },
    };
    return api;
  };
  return { updates, inserts, from: (t) => ({ select: () => chain(t, "select"), update: (p) => chain(t, "update", p), insert: (p) => chain(t, "insert", p) }) };
}

test("notification provider outage retries, then fails and alerts owner without blocking", async () => {
  const row = { id: "n1", channel: "whatsapp", audience: "customer", recipient: "+919999999999", event: "shipped", status: "pending", attempts: 0, order_id: null, payload: {} };
  const db = fakeDb([row], { notifications: { owner_email: "owner@example.com" } });
  const failing = { sendEmail: async () => ({ ok: true }), sendWhatsApp: async () => { throw new Error("provider down"); } };
  await runQueue(db, failing);
  assert.strictEqual(row.status, "pending");
  assert.strictEqual(row.attempts, 1);
  while (row.status === "pending") { row.next_attempt_at = null; await runQueue(db, failing); }
  assert.strictEqual(row.status, "failed");
  assert.strictEqual(row.attempts, MAX_ATTEMPTS);
  assert.ok(db.inserts.some((i) => i.event === "integration_failed" && i.recipient === "owner@example.com"));
});

test("unconfigured providers are logged as skipped, not sent", async () => {
  delete process.env.RESEND_API_KEY;
  const row = { id: "n2", channel: "email", audience: "customer", recipient: "a@example.com", event: "order_confirmed", status: "pending", attempts: 0, order_id: null, payload: {} };
  const db = fakeDb([row]);
  await runQueue(db);
  assert.strictEqual(row.status, "skipped");
  assert.match(row.last_error, /not configured/);
});
