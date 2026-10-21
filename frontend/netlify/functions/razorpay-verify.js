const { admin, json, parse, limited, rzp, razorpayReady, env, hmac, safeEq, userFromEvent } = require("./_shared/lib");
const { runQueue } = require("./_shared/notify");

// Confirms a captured Razorpay payment for an order. Shared with the webhook.
async function settle(db, providerOrderId, paymentId) {
  const { data: tx } = await db.from("payment_transactions").select("order_id,amount").eq("provider_order_id", providerOrderId).maybeSingle();
  if (!tx) throw new Error("Unknown payment order");
  let p = await rzp(`/payments/${paymentId}`);
  if (p.order_id !== providerOrderId) throw new Error("Payment does not belong to this order");
  if (p.amount !== Math.round(Number(tx.amount) * 100) || p.currency !== "INR") throw new Error("Amount mismatch");
  if (p.status === "authorized") p = await rzp(`/payments/${paymentId}/capture`, "POST", { amount: p.amount, currency: "INR" });
  if (p.status !== "captured") return { result: "not_captured", status: p.status };
  const { data, error } = await db.rpc("confirm_payment", { p_order_id: tx.order_id, p_provider_order_id: providerOrderId, p_payment_id: paymentId, p_amount: p.amount / 100 });
  if (error) throw new Error(error.message);
  return data;
}

exports.settle = settle;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (limited(event, 20)) return json(429, { error: "Too many requests" });
  if (!razorpayReady()) return json(503, { error: "Online payment is not configured" });
  const b = parse(event);
  const { order_number, token, razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json(400, { error: "Missing payment details" });
  if (!safeEq(hmac(env("RAZORPAY_KEY_SECRET"), `${razorpay_order_id}|${razorpay_payment_id}`), razorpay_signature)) return json(400, { error: "Payment signature invalid" });
  const db = admin();
  const { data: o } = await db.from("orders").select("id,user_id,access_token").eq("order_number", order_number).maybeSingle();
  const user = await userFromEvent(event);
  if (!o || !(o.access_token === token || (user && o.user_id === user.id))) return json(404, { error: "Order not found" });
  try {
    const r = await settle(db, razorpay_order_id, razorpay_payment_id);
    await runQueue(db).catch(() => {});
    return json(200, r);
  } catch (e) {
    return json(400, { error: e.message });
  }
};
