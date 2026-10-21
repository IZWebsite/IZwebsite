const { env } = require("./lib");

const LABEL = {
  order_confirmed: "Order confirmed", payment_failed: "Payment failed", processing: "We're preparing your order", ready_to_ship: "Ready to ship",
  shipped: "Your order has shipped", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Order cancelled",
  return_approved: "Return approved", refund_initiated: "Refund initiated", refunded: "Refund completed",
  new_order: "New order received", order_cancelled: "Order cancelled", cancellation_requested: "Cancellation requested",
  return_requested: "Return requested", refund_required: "Refund required (late payment)", low_stock: "Low stock", out_of_stock: "Out of stock", stock_digest: "Daily stock check",
  account_deletion_requested: "Account deletion requested", integration_failed: "Notification integration failing",
};
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const site = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");

function emailHtml({ n, o, brand, contact }) {
  const title = LABEL[n.event] || n.event;
  const logo = brand.logo_url ? `<img src="${esc(brand.logo_url.startsWith("http") ? brand.logo_url : site() + brand.logo_url)}" alt="${esc(brand.name)}" height="40">` : `<span style="font-family:Georgia,serif;font-size:24px;letter-spacing:6px">${esc(brand.name || "IMINATIONZ")}</span>`;
  let inner = "";
  if (o) {
    const link = n.audience === "owner" ? `${site()}/admin/orders/${o.id}` : `${site()}/order/${o.order_number}?t=${o.access_token}`;
    inner = `<p style="margin:0 0 16px">Hi ${esc(n.audience === "owner" ? "there" : o.customer_name.split(" ")[0])}, order <b>${esc(o.order_number)}</b> — ${esc(title.toLowerCase())}.</p>
    ${o.tracking_number && ["shipped", "out_for_delivery", "ready_to_ship"].includes(n.event) ? `<p>Courier: ${esc(o.courier_name || "")} · Tracking: <b>${esc(o.tracking_number)}</b> ${o.tracking_url ? `<a href="${esc(o.tracking_url)}">Track</a>` : ""}</p>` : ""}
    <table width="100%" cellpadding="6" style="border-collapse:collapse;font-size:14px">${(o.order_items || []).map((i) => `<tr style="border-bottom:1px solid #eee"><td>${esc(i.product_name)}${i.variant_name ? ` (${esc(i.variant_name)})` : ""} × ${i.quantity}</td><td align="right">${inr(i.line_total)}</td></tr>`).join("")}
    <tr><td>Discount</td><td align="right">−${inr(o.discount)}</td></tr><tr><td>Shipping</td><td align="right">${inr(o.shipping_fee)}</td></tr><tr><td><b>Total</b></td><td align="right"><b>${inr(o.total)}</b></td></tr></table>
    <p style="margin:24px 0"><a href="${link}" style="background:#2b2420;color:#fbf8f3;padding:12px 22px;text-decoration:none">View order</a></p>`;
  } else if (n.event === "stock_digest") {
    const p = n.payload || {};
    inner = `<p style="margin:0 0 16px">${p.out || 0} out of stock · ${p.low || 0} running low.</p>
    <table width="100%" cellpadding="6" style="border-collapse:collapse;font-size:14px"><tr style="background:#fbf8f3"><td><b>Product</b></td><td><b>SKU</b></td><td align="right"><b>Left</b></td></tr>${(p.items || []).map((i) => `<tr style="border-bottom:1px solid #eee"><td>${esc(i.name)}</td><td>${esc(i.sku)}</td><td align="right" style="color:${i.available <= 0 ? "#b91c1c" : "#b45309"}">${i.available <= 0 ? "Sold out" : i.available}</td></tr>`).join("")}</table>
    <p style="margin:24px 0"><a href="${site()}/admin/products?stock=low" style="background:#2b2420;color:#fbf8f3;padding:12px 22px;text-decoration:none">Restock now</a></p>`;
  } else {
    inner = `<p>${esc(title)}: ${esc(Object.entries(n.payload || {}).map(([k, v]) => `${k}: ${v}`).join(", "))}</p>`;
  }
  return `<div style="background:#fbf8f3;padding:32px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2420"><div style="max-width:560px;margin:auto;background:#fff;padding:32px;border:1px solid #eee4d6">
  <div style="text-align:center;margin-bottom:24px">${logo}</div><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 16px">${esc(title)}</h1>${inner}
  <p style="font-size:12px;color:#7a6e65;margin-top:32px;border-top:1px solid #eee;padding-top:16px">${esc(brand.tagline || "")}<br>Questions? ${esc(contact.email || "")} ${esc(contact.phone || "")}</p></div></div>`;
}

async function sendEmail(to, subject, html) {
  if (!env("RESEND_API_KEY") || !env("EMAIL_FROM")) return { skipped: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM)" };
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env("EMAIL_FROM"), to: [to], subject, html }) });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

// Uses an approved WhatsApp template. Template name per event: WHATSAPP_TEMPLATE_<EVENT> or WHATSAPP_TEMPLATE_DEFAULT.
// The default template is expected to take 3 body params: {{1}} name, {{2}} order number, {{3}} status text.
async function sendWhatsApp(to, n, o) {
  if (!env("WHATSAPP_TOKEN") || !env("WHATSAPP_PHONE_NUMBER_ID")) return { skipped: "WhatsApp not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)" };
  const tpl = env(`WHATSAPP_TEMPLATE_${n.event.toUpperCase()}`) || env("WHATSAPP_TEMPLATE_DEFAULT");
  if (!tpl) return { skipped: "No approved WhatsApp template configured" };
  const params = [o ? o.customer_name.split(" ")[0] : "Owner", o ? o.order_number : "-", LABEL[n.event] || n.event].map((text) => ({ type: "text", text }));
  const res = await fetch(`https://graph.facebook.com/v21.0/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "template", template: { name: tpl, language: { code: env("WHATSAPP_TEMPLATE_LANG") || "en" }, components: [{ type: "body", parameters: params }] } }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

const MAX_ATTEMPTS = 5;

async function runQueue(db, senders = { sendEmail, sendWhatsApp }) {
  const { data: queue } = await db.from("notification_logs").select("*").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(25);
  if (!queue?.length) return 0;
  const { data: st } = await db.from("store_settings").select("key,value").in("key", ["brand", "contact"]);
  const s = Object.fromEntries((st || []).map((r) => [r.key, r.value]));
  let processed = 0;
  for (const n of queue) {
    const attempts = n.attempts + 1;
    // claim the row so parallel runs don't double-send
    const { data: claimed } = await db.from("notification_logs").update({ attempts, next_attempt_at: new Date(Date.now() + 10 * 60000).toISOString() }).eq("id", n.id).eq("attempts", attempts - 1).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    let o = null;
    if (n.order_id) ({ data: o } = await db.from("orders").select("*, order_items(*)").eq("id", n.order_id).maybeSingle());
    try {
      const subject = `${LABEL[n.event] || n.event}${o ? ` · ${o.order_number}` : ""} | ${s.brand?.name || "IMINATIONZ"}`;
      const r = n.channel === "email"
        ? await senders.sendEmail(n.recipient, subject, emailHtml({ n, o, brand: s.brand || {}, contact: s.contact || {} }))
        : await senders.sendWhatsApp(n.recipient, n, o);
      await db.from("notification_logs").update(r.skipped ? { status: "skipped", last_error: r.skipped } : { status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", n.id);
    } catch (e) {
      const failed = attempts >= MAX_ATTEMPTS;
      await db.from("notification_logs").update({ status: failed ? "failed" : "pending", last_error: e.message.slice(0, 300), next_attempt_at: new Date(Date.now() + 2 ** attempts * 60000).toISOString() }).eq("id", n.id);
      if (failed && n.event !== "integration_failed") {
        const { data: ns } = await db.from("store_settings").select("value").eq("key", "notifications").maybeSingle();
        const ownerEmail = ns?.value?.owner_email;
        if (ownerEmail && !(n.channel === "email" && n.recipient === ownerEmail)) {
          await db.from("notification_logs").insert({ channel: "email", audience: "owner", recipient: ownerEmail, event: "integration_failed", payload: { channel: n.channel, error: e.message.slice(0, 200) } });
        }
      }
    }
    processed++;
  }
  return processed;
}

module.exports = { runQueue, emailHtml, LABEL, MAX_ATTEMPTS };
