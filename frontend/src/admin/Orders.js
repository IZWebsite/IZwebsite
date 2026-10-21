import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Printer, Download } from "lucide-react";
import { supabase, errMsg, callFunction } from "../lib/supabase";
import { useAuth, can } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { inr, fmtDate, STATUS, PAYMENT, TRANSITIONS, toCSV, download } from "../lib/format";
import { StatusBadge, Field, Spinner } from "../components/Bits";
import { Card, PageTitle, confirmAction } from "./kit";

export function Orders() {
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState(null);
  const f = Object.fromEntries(sp.entries());
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); };
  const build = useCallback(() => {
    let q = supabase.from("orders").select("id,order_number,created_at,customer_name,email,phone,status,payment_method,payment_status,total,courier_name,tracking_number,shipping_address,subtotal,discount,shipping_fee,coupon_code").order("created_at", { ascending: false });
    if (f.status) q = q.eq("status", f.status);
    if (f.pay) q = q.eq("payment_method", f.pay);
    if (f.from) q = q.gte("created_at", new Date(f.from + "T00:00:00+05:30").toISOString());
    if (f.to) q = q.lte("created_at", new Date(f.to + "T23:59:59+05:30").toISOString());
    if (f.q) { const s = f.q.replace(/[%,()]/g, " ").trim(); q = q.or(`order_number.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,customer_name.ilike.%${s}%`); }
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);
  useEffect(() => { setRows(null); build().limit(200).then(({ data }) => setRows(data || [])); }, [build]);
  const exportCsv = async () => {
    const { data } = await build().limit(5000);
    download(`orders-${new Date().toISOString().slice(0, 10)}.csv`, toCSV((data || []).map((o) => ({ order_number: o.order_number, date: fmtDate(o.created_at, true), customer: o.customer_name, email: o.email, phone: o.phone, status: STATUS[o.status], payment_method: o.payment_method, payment_status: o.payment_status, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping_fee, total: o.total, coupon: o.coupon_code, city: o.shipping_address?.city, pincode: o.shipping_address?.pincode, courier: o.courier_name, tracking: o.tracking_number }))));
  };
  return (
    <div data-testid="admin-orders">
      <PageTitle title="Orders"><button className="btn-outline h-10" onClick={exportCsv} data-testid="orders-export-btn"><Download size={15} />Export CSV</button></PageTitle>
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">{["", "confirmed", "processing", "ready_to_ship", "shipped", "delivered", "cancellation_requested", "return_requested", "pending_payment", "cancelled"].map((s) => (
        <button key={s} onClick={() => set("status", s)} className={`chip whitespace-nowrap h-9 ${(f.status || "") === s ? "bg-foreground text-background" : ""}`} data-testid={`orders-filter-${s || "all"}`}>{s ? STATUS[s] : "All"}</button>
      ))}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <input className="input col-span-2" placeholder="Search order no., name, email, phone" defaultValue={f.q || ""} onKeyDown={(e) => e.key === "Enter" && set("q", e.target.value)} data-testid="orders-search-input" />
        <select className="input" value={f.pay || ""} onChange={(e) => set("pay", e.target.value)} data-testid="orders-payment-filter"><option value="">All payments</option><option value="cod">COD</option><option value="razorpay">Online</option></select>
        <div className="flex gap-1"><input type="date" className="input px-1" value={f.from || ""} onChange={(e) => set("from", e.target.value)} /><input type="date" className="input px-1" value={f.to || ""} onChange={(e) => set("to", e.target.value)} /></div>
      </div>
      {!rows ? <Spinner /> : !rows.length ? <p className="text-sm text-muted-foreground py-10 text-center" data-testid="orders-empty">No orders match.</p> : (
        <div className="bg-card border divide-y">{rows.map((o) => (
          <Link key={o.id} to={`/admin/orders/${o.id}`} className="grid grid-cols-2 md:grid-cols-[1.2fr_1.5fr_1fr_1fr_auto] gap-2 items-center p-4 hover:bg-secondary/50" data-testid={`admin-order-row-${o.order_number}`}>
            <div><p className="font-medium text-sm">{o.order_number}</p><p className="text-xs text-muted-foreground">{fmtDate(o.created_at, true)}</p></div>
            <div className="text-sm truncate">{o.customer_name}<p className="text-xs text-muted-foreground truncate">{o.phone}</p></div>
            <StatusBadge status={o.status} />
            <span className="text-xs text-muted-foreground">{o.payment_method === "cod" ? "COD" : "Online"} · {PAYMENT[o.payment_status]}</span>
            <span className="text-sm font-medium text-right">{inr(o.total)}</span>
          </Link>
        ))}</div>
      )}
    </div>
  );
}

function Invoice({ o, settings }) {
  const a = o.shipping_address;
  return (
    <div className="hidden print:block p-8 text-sm" data-testid="invoice-print">
      <div className="flex justify-between mb-8"><div><p className="font-display text-3xl tracking-[0.2em]">{settings.brand?.name}</p><p>{settings.contact?.address}</p><p>{settings.contact?.email} · {settings.contact?.phone}</p></div><div className="text-right"><p className="font-medium">INVOICE / PACKING SLIP</p><p>{o.order_number}</p><p>{fmtDate(o.created_at)}</p></div></div>
      <p className="font-medium">Ship to</p><p className="mb-6">{a.full_name}<br />{a.line1} {a.line2}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
      <table className="w-full border-collapse mb-6"><thead><tr className="border-b"><th className="text-left py-2">Item</th><th>SKU</th><th>Qty</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{o.order_items.map((i) => <tr key={i.id} className="border-b"><td className="py-2">{i.product_name} {i.variant_name && `(${i.variant_name})`}</td><td className="text-center">{i.sku}</td><td className="text-center">{i.quantity}</td><td className="text-right">{inr(i.line_total)}</td></tr>)}</tbody></table>
      <div className="ml-auto w-64 space-y-1"><p className="flex justify-between"><span>Subtotal</span><span>{inr(o.subtotal)}</span></p><p className="flex justify-between"><span>Discount</span><span>−{inr(o.discount)}</span></p><p className="flex justify-between"><span>Shipping</span><span>{inr(o.shipping_fee)}</span></p><p className="flex justify-between"><span>GST {o.tax_inclusive ? "(incl.)" : ""}</span><span>{inr(o.tax)}</span></p><p className="flex justify-between font-medium border-t pt-1"><span>Total</span><span>{inr(o.total)}</span></p><p>Payment: {o.payment_method === "cod" ? "Cash on delivery" : "Online"} ({PAYMENT[o.payment_status]})</p></div>
      <p className="mt-10 text-xs">[Add your GSTIN and invoice terms in Settings before launch]</p>
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const { settings } = useStore();
  const [o, setO] = useState(null);
  const [notes, setNotes] = useState([]);
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [trk, setTrk] = useState({ courier: "", number: "", url: "" });
  const [internal, setInternal] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("orders").select("*, order_items(*), order_status_history(*), shipping_updates(*), returns_and_refunds(*), payment_transactions(*)").eq("id", id).single();
    setO(data);
    if (data) setTrk({ courier: data.courier_name || "", number: data.tracking_number || "", url: data.tracking_url || "" });
    const { data: n } = await supabase.from("staff_notes").select("*").eq("entity", "order").eq("entity_id", id).order("created_at", { ascending: false });
    setNotes(n || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!o) return <Spinner />;
  const update = async (status) => {
    if (status && ["cancelled", "refunded", "returned"].includes(status) && !confirmAction(`Mark order as "${STATUS[status]}"? Stock will be restored where applicable.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_order", { p_order_id: o.id, p_status: status || null, p_note: note || null, p_courier: trk.courier || null, p_tracking_number: trk.number || null, p_tracking_url: trk.url || null });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(status ? `Status: ${STATUS[status]}` : "Tracking saved"); setNext(""); setNote(""); load();
    callFunction("process-notifications", {}).catch(() => {});
  };
  const addNote = async () => {
    if (!internal.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("staff_notes").insert({ entity: "order", entity_id: o.id, note: internal.trim(), created_by: user.id });
    if (error) return toast.error(errMsg(error));
    setInternal(""); load();
  };
  const refund = async () => {
    if (!confirmAction(`Refund ${inr(o.total)} to the customer via Razorpay?`)) return;
    try { await callFunction("admin-refund", { order_id: o.id }); toast.success("Refund initiated with Razorpay"); load(); } catch (e) { toast.error(e.message); }
  };
  const a = o.shipping_address;
  const options = TRANSITIONS[o.status] || [];
  return (
    <div data-testid="admin-order-detail">
      <div className="no-print">
        <Link to="/admin/orders" className="text-xs link-u">← All orders</Link>
        <PageTitle title={o.order_number}><StatusBadge status={o.status} testid="admin-order-status" /><button className="btn-outline h-10" onClick={() => window.print()} data-testid="print-invoice-btn"><Printer size={15} />Invoice / slip</button></PageTitle>
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <Card title="Items">{o.order_items.map((i) => <div key={i.id} className="flex gap-3 py-2 border-b last:border-0 text-sm"><img src={i.image_url || "/demo/set.jpg"} alt="" className="w-12 h-14 object-cover" /><div className="flex-1"><p>{i.product_name} {i.variant_name && <span className="text-muted-foreground">· {i.variant_name}</span>}</p><p className="text-xs text-muted-foreground">{i.sku} · {i.quantity} × {inr(i.unit_price)}</p></div><span>{inr(i.line_total)}</span></div>)}
              <div className="text-sm mt-4 space-y-1 ml-auto max-w-xs"><p className="flex justify-between"><span>Subtotal</span>{inr(o.subtotal)}</p><p className="flex justify-between"><span>Discount {o.coupon_code && `(${o.coupon_code})`}</span>−{inr(o.discount)}</p><p className="flex justify-between"><span>Shipping</span>{inr(o.shipping_fee)}</p><p className="flex justify-between font-medium"><span>Total</span>{inr(o.total)}</p></div></Card>
            <Card title="Customer & delivery"><div className="grid sm:grid-cols-2 gap-4 text-sm"><div><p className="label">Contact</p><p>{o.customer_name}</p><p>{o.email}</p><a href={`tel:${o.phone}`} className="link-u">{o.phone}</a>{o.whatsapp_opt_in && <p className="text-xs text-emerald-700">WhatsApp updates: opted in</p>}</div><div><p className="label">Ship to</p><p>{a.full_name}, {a.line1} {a.line2}, {a.city}, {a.state} {a.pincode}</p></div></div>{o.customer_note && <p className="text-sm mt-4 p-3 bg-secondary"><span className="label">Customer note</span>{o.customer_note}</p>}</Card>
            <Card title="History & audit trail">{o.order_status_history.sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).map((h) => <p key={h.id} className="text-sm py-1"><span className="text-muted-foreground">{fmtDate(h.created_at, true)}</span> — {h.from_status ? `${STATUS[h.from_status]} → ` : ""}{STATUS[h.to_status]}{h.note && <span className="text-muted-foreground"> · {h.note}</span>}</p>)}
              {o.returns_and_refunds.map((r) => <p key={r.id} className="text-sm py-1 text-amber-800">{r.type} request ({r.status}): {r.reason}</p>)}
              {o.payment_transactions.map((p) => <p key={p.id} className="text-xs text-muted-foreground py-1">Payment {p.provider_payment_id || p.provider_order_id}: {p.status} {inr(p.amount)}</p>)}</Card>
          </div>
          <div className="space-y-6">
            <Card title="Update status">
              <p className="text-xs text-muted-foreground mb-3">Payment: {o.payment_method === "cod" ? "COD" : "Online"} · {PAYMENT[o.payment_status]}</p>
              {options.length ? <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">{options.map((s) => <button key={s} onClick={() => setNext(s)} className={`h-12 px-2 text-sm border ${next === s ? "bg-foreground text-background" : ""}`} data-testid={`status-option-${s}`}>{STATUS[s]}</button>)}</div>
                <input className="input" placeholder="Note (optional, visible in history)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="status-note-input" />
                <button className="btn-primary w-full h-12" disabled={!next || busy} onClick={() => update(next)} data-testid="status-update-btn">{busy ? <Spinner /> : next ? `Mark as ${STATUS[next]}` : "Choose a status"}</button>
              </div> : <p className="text-sm text-muted-foreground">No further status changes.</p>}
              {o.payment_method === "razorpay" && o.payment_status === "paid" && ["cancelled", "returned", "refund_initiated"].includes(o.status) && can(role, "refunds") && <button className="btn-outline w-full mt-3" onClick={refund} data-testid="razorpay-refund-btn">Refund via Razorpay</button>}
            </Card>
            <Card title="Shipment tracking">
              <div className="space-y-3"><Field label="Courier"><input className="input" value={trk.courier} onChange={(e) => setTrk({ ...trk, courier: e.target.value })} data-testid="tracking-courier-input" /></Field><Field label="Tracking number"><input className="input" value={trk.number} onChange={(e) => setTrk({ ...trk, number: e.target.value })} data-testid="tracking-number-input" /></Field><Field label="Tracking URL"><input className="input" value={trk.url} onChange={(e) => setTrk({ ...trk, url: e.target.value })} data-testid="tracking-url-input" /></Field><button className="btn-outline w-full" onClick={() => update(null)} data-testid="tracking-save-btn">Save tracking</button></div>
            </Card>
            <Card title="Internal notes"><p className="text-xs text-muted-foreground -mt-3 mb-3">Staff only — never shown to the customer.</p><textarea className="input h-20 py-2" value={internal} onChange={(e) => setInternal(e.target.value)} data-testid="internal-note-input" /><button className="btn-outline h-10 mt-2" onClick={addNote} data-testid="internal-note-save-btn">Add note</button>{notes.map((n) => <p key={n.id} className="text-sm border-t mt-3 pt-2">{n.note}<span className="block text-xs text-muted-foreground">{fmtDate(n.created_at, true)}</span></p>)}</Card>
          </div>
        </div>
      </div>
      <Invoice o={o} settings={settings} />
    </div>
  );
}
