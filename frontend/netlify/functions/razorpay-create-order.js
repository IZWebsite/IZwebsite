const { admin, json, parse, limited, rzp, razorpayReady, env, userFromEvent } = require("./_shared/lib");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (limited(event, 20)) return json(429, { error: "Too many requests" });
  if (!razorpayReady()) return json(503, { error: "Online payment is not configured yet" });
  const { order_number, token } = parse(event);
  if (!order_number) return json(400, { error: "Missing order" });
  const db = admin();
  const { data: o } = await db.from("orders").select("id,order_number,user_id,access_token,status,total,reservation_expires_at,payment_method").eq("order_number", order_number).maybeSingle();
  const user = await userFromEvent(event);
  if (!o || !(o.access_token === token || (user && o.user_id === user.id))) return json(404, { error: "Order not found" });
  if (o.payment_method !== "razorpay" || o.status !== "pending_payment") return json(409, { error: "This order is not awaiting payment" });
  if (new Date(o.reservation_expires_at) < new Date()) return json(410, { error: "Payment window expired. Please place the order again." });

  const amount = Math.round(Number(o.total) * 100);
  const { data: existing } = await db.from("payment_transactions").select("provider_order_id,amount").eq("order_id", o.id).eq("status", "created").maybeSingle();
  if (existing && Math.round(Number(existing.amount) * 100) === amount) {
    return json(200, { key_id: env("RAZORPAY_KEY_ID"), razorpay_order_id: existing.provider_order_id, amount });
  }
  try {
    const r = await rzp("/orders", "POST", { amount, currency: "INR", receipt: o.order_number, notes: { order_id: o.id, order_number: o.order_number } });
    await db.from("payment_transactions").insert({ order_id: o.id, provider: "razorpay", provider_order_id: r.id, amount: o.total, status: "created" });
    return json(200, { key_id: env("RAZORPAY_KEY_ID"), razorpay_order_id: r.id, amount });
  } catch (e) {
    return json(502, { error: "Could not start payment. Please try again." });
  }
};
