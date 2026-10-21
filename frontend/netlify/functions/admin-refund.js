const { admin, asUser, json, parse, rzp, razorpayReady, staffFromEvent } = require("./_shared/lib");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const staff = await staffFromEvent(event);
  if (!staff || !["owner", "manager"].includes(staff.role)) return json(403, { error: "Only owner or manager can refund" });
  if (!razorpayReady()) return json(503, { error: "Razorpay is not configured" });
  const { order_id } = parse(event);
  const db = admin();
  const { data: o } = await db.from("orders").select("id,status,total,payment_status,payment_method,refunded_amount").eq("id", order_id).maybeSingle();
  if (!o || o.payment_method !== "razorpay" || o.payment_status !== "paid") return json(409, { error: "Order is not a paid online order" });
  const { data: tx } = await db.from("payment_transactions").select("provider_payment_id").eq("order_id", o.id).eq("status", "captured").maybeSingle();
  if (!tx) return json(409, { error: "No captured payment found" });
  try {
    const r = await rzp(`/payments/${tx.provider_payment_id}/refund`, "POST", { amount: Math.round((Number(o.total) - Number(o.refunded_amount)) * 100), notes: { order_id: o.id } });
    await db.from("returns_and_refunds").insert({ order_id: o.id, type: "refund", status: "approved", amount: o.total, provider_refund_id: r.id, reason: "Refund initiated by staff" });
    if (o.status !== "refund_initiated") {
      const { error } = await asUser(staff.jwt).rpc("admin_update_order", { p_order_id: o.id, p_status: "refund_initiated", p_note: `Razorpay refund ${r.id}` });
      if (error) return json(200, { refund_id: r.id, warning: error.message });
    }
    return json(200, { refund_id: r.id });
  } catch (e) {
    return json(502, { error: e.message });
  }
};
