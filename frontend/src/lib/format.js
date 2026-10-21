export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n || 0));

export const fmtDate = (d, withTime = false) =>
  d ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }).format(new Date(d)) : "—";

export const STATUS = {
  pending_payment: "Pending payment", confirmed: "Order confirmed", processing: "Processing", ready_to_ship: "Ready to ship",
  shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered", cancellation_requested: "Cancellation requested",
  cancelled: "Cancelled", return_requested: "Return requested", return_approved: "Return approved", returned: "Returned",
  refund_initiated: "Refund initiated", refunded: "Refunded", payment_failed: "Payment failed",
};

export const TRANSITIONS = {
  pending_payment: ["payment_failed", "cancelled"], confirmed: ["processing", "ready_to_ship", "cancelled"],
  processing: ["ready_to_ship", "cancelled"], ready_to_ship: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"], out_for_delivery: ["delivered", "returned"],
  delivered: ["return_requested", "return_approved"], cancellation_requested: ["cancelled", "confirmed", "processing"],
  return_requested: ["return_approved", "delivered"], return_approved: ["returned"], returned: ["refund_initiated", "refunded"],
  cancelled: ["refund_initiated", "refunded"], refund_initiated: ["refunded"], refunded: [], payment_failed: [],
};

export const PAYMENT = { pending: "Awaiting payment", cod_pending: "Cash on delivery", paid: "Paid", failed: "Failed", refunded: "Refunded", partially_refunded: "Partly refunded" };

export const statusTone = (s) =>
  ["cancelled", "payment_failed", "returned", "refunded"].includes(s) ? "bg-red-50 text-red-800 border-red-200"
  : ["delivered"].includes(s) ? "bg-emerald-50 text-emerald-800 border-emerald-200"
  : ["cancellation_requested", "return_requested", "pending_payment", "refund_initiated", "return_approved"].includes(s) ? "bg-amber-50 text-amber-800 border-amber-200"
  : "bg-secondary text-foreground border-border";

export const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function toCSV(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export function parseCSV(text) {
  const rows = []; let row = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ""));
  return (body || []).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

export function download(filename, content, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export const getRecent = () => { try { return JSON.parse(localStorage.getItem("imz_recent") || "[]"); } catch { return []; } };
export const pushRecent = (id) => localStorage.setItem("imz_recent", JSON.stringify([id, ...getRecent().filter((x) => x !== id)].slice(0, 12)));
