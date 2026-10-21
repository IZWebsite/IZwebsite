import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useSeo } from "../lib/seo";
import { inr, fmtDate, STATUS, PAYMENT } from "../lib/format";
import { payOnline } from "./Checkout";
import { Empty, StatusBadge } from "../components/Bits";

const FLOW = ["confirmed", "processing", "ready_to_ship", "shipped", "delivered"];

export default function OrderPage() {
  const { number } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t");
  const nav = useNavigate();
  const [o, setO] = useState(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState(null);
  useSeo({ title: `Order ${number}`, noindex: true });

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_order", { p_order_number: number, p_token: token || null });
    setO(error ? { missing: true } : data);
  }, [number, token]);
  useEffect(() => { load(); }, [load]);

  if (!o) return <div className="container-x py-20 animate-pulse"><div className="h-10 bg-muted w-1/3" /></div>;
  if (o.missing) return <div className="container-x py-20"><Empty title="Order not found" text="Please use the link from your confirmation email, or log in to view your orders." action="Track an order" to="/track" /></div>;

  const act = async (fn) => {
    const { data, error } = await supabase.rpc(fn, { p_order_number: o.order_number, p_token: token || null, p_reason: reason });
    if (error) return toast.error(errMsg(error));
    toast.success(STATUS[data.status]); setMode(null); setReason(""); load();
  };
  const step = FLOW.indexOf(o.status === "out_for_delivery" ? "shipped" : o.status);
  const a = o.shipping_address || {};
  const canCancel = ["pending_payment", "confirmed", "processing"].includes(o.status);
  const canReturn = o.status === "delivered" && o.delivered_at && (Date.now() - new Date(o.delivered_at)) / 864e5 <= o.return_window_days;

  return (
    <div className="container-x py-10 md:py-14 max-w-4xl" data-testid="order-page">
      {sp.get("new") && <div className="card-x p-6 mb-10 flex gap-4 items-start reveal" data-testid="order-success-banner"><CheckCircle2 className="text-emerald-700 shrink-0" /><div><p className="font-display text-2xl">Thank you! Your order is confirmed.</p><p className="text-sm text-muted-foreground mt-1">A confirmation will be sent to {o.email}. Bookmark this page to track your order.</p></div></div>}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div><p className="eyebrow mb-2">Order</p><h1 className="font-display text-4xl" data-testid="order-number">{o.order_number}</h1><p className="text-sm text-muted-foreground mt-1">Placed {fmtDate(o.created_at, true)}</p></div>
        <div className="flex flex-col items-end gap-2"><StatusBadge status={o.status} testid="order-status" /><span className="text-xs text-muted-foreground" data-testid="order-payment-status">{o.payment_method === "cod" ? "Cash on delivery" : "Online"} · {PAYMENT[o.payment_status]}</span></div>
      </div>
      {o.status === "pending_payment" && (
        <div className="card-x p-5 mb-8 flex flex-wrap items-center justify-between gap-4" data-testid="pending-payment-box">
          <p className="text-sm">Payment not completed. Items are held until {fmtDate(o.reservation_expires_at, true)}.</p>
          <button className="btn-gold h-10" onClick={() => payOnline(o, { name: o.customer_name, email: o.email, phone: o.phone }, nav).catch((e) => toast.error(e.message))} data-testid="retry-payment-btn">Complete payment</button>
        </div>
      )}
      {step >= 0 && (
        <ol className="grid grid-cols-5 gap-2 mb-12" data-testid="order-progress">{FLOW.map((s, i) => (
          <li key={s} className="text-center"><div className={`h-[3px] ${i <= step ? "bg-[color:var(--gold)]" : "bg-border"}`} /><p className={`text-[10px] md:text-xs mt-2 uppercase tracking-wider ${i <= step ? "" : "text-muted-foreground"}`}>{STATUS[s]}</p></li>
        ))}</ol>
      )}
      {(o.tracking_number || o.tracking_url) && <div className="card-x p-5 mb-8 text-sm" data-testid="tracking-info"><p className="label">Shipment</p><p>{o.courier_name} {o.tracking_number && `· ${o.tracking_number}`}</p>{o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="link-u">Track shipment →</a>}</div>}
      <div className="grid md:grid-cols-[1fr_300px] gap-10">
        <div className="divide-y border-y">{o.items.map((i) => (
          <div key={i.id} className="py-4 flex gap-4"><img src={i.image_url || "/demo/set.jpg"} alt="" className="w-16 h-20 object-cover" /><div className="flex-1 text-sm"><p>{i.product_name}</p>{i.variant_name && <p className="text-xs text-muted-foreground">{i.variant_name}</p>}<p className="text-xs text-muted-foreground">{i.sku} · Qty {i.quantity} × {inr(i.unit_price)}</p></div><span className="text-sm">{inr(i.line_total)}</span></div>
        ))}</div>
        <div className="space-y-6 text-sm">
          <dl className="space-y-1.5"><div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(o.subtotal)}</dd></div>{Number(o.discount) > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{inr(o.discount)}</dd></div>}<div className="flex justify-between"><dt>Shipping</dt><dd>{inr(o.shipping_fee)}</dd></div><div className="flex justify-between text-muted-foreground"><dt>GST {o.tax_inclusive ? "(incl.)" : ""}</dt><dd>{inr(o.tax)}</dd></div><div className="flex justify-between font-medium border-t pt-2"><dt>Total</dt><dd>{inr(o.total)}</dd></div></dl>
          <div><p className="label">Delivering to</p><p>{a.full_name}<br />{a.line1}{a.line2 && <>, {a.line2}</>}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p></div>
        </div>
      </div>
      <div className="mt-10 space-y-2"><p className="label">History</p>{o.history.map((h, i) => <p key={i} className="text-sm"><span className="text-muted-foreground">{fmtDate(h.created_at, true)}</span> — {STATUS[h.to_status]}</p>)}</div>
      <div className="mt-10 flex flex-wrap gap-3 no-print">
        {canCancel && <button className="btn-outline" onClick={() => setMode("cancel")} data-testid="cancel-order-btn">Cancel order</button>}
        {canReturn && <button className="btn-outline" onClick={() => setMode("return")} data-testid="return-order-btn">Request return</button>}
        <Link to="/pages/returns" className="btn-ghost">Return policy</Link>
      </div>
      {mode && (
        <div className="card-x p-5 mt-4 space-y-3" data-testid="order-request-form">
          <p className="text-sm">{mode === "cancel" ? "Tell us why you'd like to cancel (optional)." : "Tell us why you'd like to return this order."}</p>
          <textarea className="input h-20 py-2" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="order-request-reason" />
          <div className="flex gap-2"><button className="btn-primary h-10" onClick={() => act(mode === "cancel" ? "customer_cancel_order" : "customer_request_return")} data-testid="order-request-submit">Confirm</button><button className="btn-ghost h-10" onClick={() => setMode(null)}>Keep order</button></div>
        </div>
      )}
    </div>
  );
}
