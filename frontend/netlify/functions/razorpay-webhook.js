const { admin, json, rawBody, hmac, safeEq, env } = require("./_shared/lib");
const { settle } = require("./razorpay-verify");
const { runQueue } = require("./_shared/notify");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return json(503, { error: "Webhook not configured" });
  const body = rawBody(event);
  const sig = event.headers["x-razorpay-signature"];
  if (!safeEq(hmac(secret, body), sig)) return json(401, { error: "Invalid signature" });
  let payload;
  try { payload = JSON.parse(body); } catch { return json(400, { error: "Bad payload" }); }
  const eventId = event.headers["x-razorpay-event-id"] || `${payload.event}:${payload.payload?.payment?.entity?.id || payload.payload?.refund?.entity?.id || payload.created_at}`;
  const db = admin();
  const { error: dup } = await db.from("payment_webhook_events").insert({ provider: "razorpay", event_id: eventId, event_type: payload.event, payload });
  if (dup) return json(200, { result: "duplicate_ignored" });

  let result = "ignored"; let err = null;
  try {
    const pay = payload.payload?.payment?.entity;
    if ((payload.event === "payment.captured" || payload.event === "order.paid") && pay) {
      result = (await settle(db, pay.order_id, pay.id)).result;
    } else if (payload.event === "payment.failed" && pay) {
      // a failed attempt is logged; the customer may retry until the reservation expires, after which stock is released
      await db.from("payment_transactions").update({ status: "failed", error: pay.error_description || "failed", updated_at: new Date().toISOString() }).eq("provider_order_id", pay.order_id).neq("status", "captured");
      result = "failure_logged";
    } else if (payload.event === "refund.processed") {
      const ref = payload.payload.refund.entity;
      const { data: tx } = await db.from("payment_transactions").select("order_id").eq("provider_payment_id", ref.payment_id).maybeSingle();
      if (tx) { await db.rpc("mark_refunded", { p_order_id: tx.order_id, p_refund_id: ref.id }); result = "refunded"; }
    }
    await runQueue(db).catch(() => {});
  } catch (e) { err = e.message; }
  await db.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), error: err }).eq("event_id", eventId);
  return json(err ? 500 : 200, { result, error: err });
};
