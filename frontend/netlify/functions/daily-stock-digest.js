const { admin } = require("./_shared/lib");
const { runQueue } = require("./_shared/notify");

const pickItems = (rows) => (rows || [])
  .filter((p) => p.available <= p.low_stock_threshold)
  .sort((a, b) => a.available - b.available)
  .map((p) => ({ name: p.name, sku: p.sku, available: Math.max(p.available, 0) }));

// Scheduled daily at 09:00 IST (see netlify.toml): emails the owner a list of low and out-of-stock products.
exports.handler = async () => {
  const db = admin();
  const { data: rows } = await db.from("catalog").select("name,sku,available,low_stock_threshold").eq("status", "published").limit(1000);
  const items = pickItems(rows);
  if (!items.length) return { statusCode: 200, body: JSON.stringify({ items: 0 }) };
  const { data: ns } = await db.from("store_settings").select("value").eq("key", "notifications").maybeSingle();
  const n = ns?.value || {};
  if (n.owner_email_enabled === false || !n.owner_email) return { statusCode: 200, body: JSON.stringify({ items: items.length, skipped: "No owner alert email set" }) };
  const payload = { items: items.slice(0, 100), out: items.filter((i) => i.available <= 0).length, low: items.filter((i) => i.available > 0).length };
  await db.from("notification_logs").insert({ channel: "email", audience: "owner", recipient: n.owner_email, event: "stock_digest", payload });
  await runQueue(db);
  return { statusCode: 200, body: JSON.stringify({ items: items.length }) };
};
exports.pickItems = pickItems;
