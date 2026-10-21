import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase, errMsg, callFunction } from "../lib/supabase";
import { useShop } from "../context/ShopContext";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { useSeo } from "../lib/seo";
import { track, uid } from "../lib/analytics";
import { inr } from "../lib/format";
import { useQuote, Totals } from "./Cart";
import { Empty, Field, Spinner } from "../components/Bits";

const STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];

const loadRazorpay = () => new Promise((res, rej) => {
  if (window.Razorpay) return res();
  const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = res; s.onerror = () => rej(new Error("Could not load payment window")); document.body.appendChild(s);
});

export async function payOnline(order, contact, nav) {
  const init = await callFunction("razorpay-create-order", { order_number: order.order_number, token: order.access_token });
  await loadRazorpay();
  const target = `/order/${order.order_number}?t=${order.access_token}`;
  const rzp = new window.Razorpay({
    key: init.key_id, order_id: init.razorpay_order_id, amount: init.amount, currency: "INR", name: "IMINATIONZ",
    description: `Order ${order.order_number}`, prefill: { name: contact.name, email: contact.email, contact: contact.phone }, theme: { color: "#2b2420" },
    handler: async (r) => {
      try { await callFunction("razorpay-verify", { order_number: order.order_number, token: order.access_token, ...r }); toast.success("Payment verified"); }
      catch (e) { toast.error(`${e.message}. If money was debited, it will be confirmed automatically.`); }
      nav(target);
    },
    modal: { ondismiss: () => nav(target) },
  });
  rzp.on("payment.failed", (r) => toast.error(r.error?.description || "Payment failed"));
  rzp.open();
}

export default function Checkout() {
  const { items, clear } = useShop();
  const { user, profile } = useAuth();
  const { settings } = useStore();
  const nav = useNavigate();
  const pay = settings.payments || {};
  const [c, setC] = useState({ name: "", email: "", cc: "+91", phone: "" });
  const [a, setA] = useState({ line1: "", line2: "", city: "", state: "", pincode: "" });
  const [saved, setSaved] = useState([]);
  const [method, setMethod] = useState(pay.razorpay_enabled ? "razorpay" : "cod");
  const [wa, setWa] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const idem = useMemo(() => uid(), []);
  const coupon = sessionStorage.getItem("imz_coupon") || "";
  const { q } = useQuote(items, coupon, c.email);
  useSeo({ title: "Checkout", noindex: true });

  useEffect(() => { track("checkout_start"); }, []);
  useEffect(() => {
    if (!user) return;
    setC((x) => ({ ...x, email: user.email, name: x.name || profile?.full_name || "", phone: x.phone || (profile?.phone || "").replace(/^\+91/, "") }));
    setWa(!!profile?.whatsapp_opt_in);
    supabase.from("addresses").select("*").order("is_default", { ascending: false }).then(({ data }) => {
      setSaved(data || []);
      if (data?.[0]) setA({ line1: data[0].line1, line2: data[0].line2 || "", city: data[0].city, state: data[0].state, pincode: data[0].pincode });
    });
  }, [user, profile]);

  if (!items.length) return <div className="container-x py-20"><Empty title="Nothing to check out" action="Continue shopping" to="/shop" /></div>;

  const place = async (e) => {
    e.preventDefault();
    if (!agree) return toast.error("Please accept the terms and policies");
    setBusy(true);
    const contact = { name: c.name, email: c.email, phone: `${c.cc}${c.phone.replace(/\D/g, "")}` };
    const { data, error } = await supabase.rpc("place_order", {
      p_items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })),
      p_contact: contact, p_address: { ...a, full_name: c.name, phone: contact.phone }, p_coupon: coupon || null,
      p_payment_method: method, p_note: note || null, p_whatsapp_opt_in: wa, p_idempotency_key: idem,
    });
    if (error) { setBusy(false); return toast.error(errMsg(error)); }
    track("order_placed");
    if (!user) localStorage.setItem("imz_guest_orders", JSON.stringify([{ n: data.order_number, t: data.access_token }, ...JSON.parse(localStorage.getItem("imz_guest_orders") || "[]")].slice(0, 10)));
    clear(); sessionStorage.removeItem("imz_coupon");
    callFunction("process-notifications", {}).catch(() => {});
    if (data.payment_method === "cod") return nav(`/order/${data.order_number}?t=${data.access_token}&new=1`);
    try { await payOnline(data, contact, nav); } catch (err) { toast.error(err.message); nav(`/order/${data.order_number}?t=${data.access_token}`); }
    setBusy(false);
  };
  const up = (set) => (k) => (e) => set((x) => ({ ...x, [k]: e.target.value }));
  const uc = up(setC); const ua = up(setA);

  return (
    <form onSubmit={place} className="container-x py-10 md:py-14 grid lg:grid-cols-[1fr_400px] gap-12" data-testid="checkout-page">
      <div className="space-y-10">
        <h1 className="font-display text-4xl md:text-5xl">Checkout</h1>
        {!user && <p className="text-sm card-x p-4">Checking out as guest. <Link to="/login?next=/checkout" className="link-u">Log in</Link> to save addresses and see orders in your account.</p>}
        <section className="space-y-4">
          <h2 className="font-display text-2xl">Contact</h2>
          <Field label="Full name"><input required className="input" value={c.name} onChange={uc("name")} autoComplete="name" data-testid="checkout-name-input" /></Field>
          <Field label="Email"><input required type="email" className="input" value={c.email} onChange={uc("email")} disabled={!!user} autoComplete="email" data-testid="checkout-email-input" /></Field>
          <Field label="Mobile number">
            <div className="flex gap-2"><select className="input w-24" value={c.cc} onChange={uc("cc")} data-testid="checkout-cc-select"><option>+91</option><option>+1</option><option>+44</option><option>+971</option><option>+65</option><option>+61</option></select>
              <input required className="input" inputMode="tel" value={c.phone} onChange={uc("phone")} placeholder="98765 43210" autoComplete="tel-national" data-testid="checkout-phone-input" /></div>
          </Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={wa} onChange={(e) => setWa(e.target.checked)} data-testid="checkout-whatsapp-consent" />Send me order updates on WhatsApp</label>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl">Delivery address</h2>
          {saved.length > 0 && <select className="input" onChange={(e) => { const s = saved.find((x) => x.id === e.target.value); if (s) setA({ line1: s.line1, line2: s.line2 || "", city: s.city, state: s.state, pincode: s.pincode }); }} data-testid="checkout-saved-address-select">{saved.map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.line1}, {s.city}</option>)}</select>}
          <Field label="Address line 1"><input required className="input" value={a.line1} onChange={ua("line1")} autoComplete="address-line1" data-testid="checkout-line1-input" /></Field>
          <Field label="Address line 2 (optional)"><input className="input" value={a.line2} onChange={ua("line2")} autoComplete="address-line2" data-testid="checkout-line2-input" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City"><input required className="input" value={a.city} onChange={ua("city")} data-testid="checkout-city-input" /></Field>
            <Field label="PIN code"><input required className="input" inputMode="numeric" maxLength={6} pattern="[1-9][0-9]{5}" value={a.pincode} onChange={ua("pincode")} data-testid="checkout-pincode-input" /></Field>
          </div>
          <Field label="State"><select required className="input" value={a.state} onChange={ua("state")} data-testid="checkout-state-select"><option value="">Select state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Order note (optional)"><textarea className="input h-20 py-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} data-testid="checkout-note-input" /></Field>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-2xl">Payment</h2>
          {pay.razorpay_enabled && <label className={`flex items-center gap-3 p-4 border cursor-pointer ${method === "razorpay" ? "border-foreground" : ""}`}><input type="radio" checked={method === "razorpay"} onChange={() => setMethod("razorpay")} data-testid="payment-razorpay-radio" /><span><span className="block text-sm font-medium">Pay online</span><span className="text-xs text-muted-foreground">UPI, cards, net banking via Razorpay</span></span></label>}
          {pay.cod_enabled && <label className={`flex items-center gap-3 p-4 border cursor-pointer ${method === "cod" ? "border-foreground" : ""}`}><input type="radio" checked={method === "cod"} onChange={() => setMethod("cod")} data-testid="payment-cod-radio" /><span><span className="block text-sm font-medium">Cash on Delivery</span><span className="text-xs text-muted-foreground">Pay when your order arrives</span></span></label>}
          {!pay.cod_enabled && !pay.razorpay_enabled && <p className="text-sm text-red-700">Checkout is temporarily unavailable. Please contact us.</p>}
        </section>
      </div>
      <aside className="card-x p-6 h-fit lg:sticky lg:top-24 space-y-5" data-testid="checkout-summary">
        <h2 className="font-display text-2xl">Order summary</h2>
        <div className="space-y-3 max-h-72 overflow-y-auto">{(q?.lines || []).map((l) => (
          <div key={`${l.product_id}${l.variant_id}`} className="flex gap-3 text-sm"><img src={l.image_url || "/demo/set.jpg"} alt="" className="w-14 h-16 object-cover" /><div className="flex-1"><p className="leading-snug">{l.name}</p>{l.variant_name && <p className="text-xs text-muted-foreground">{l.variant_name}</p>}<p className="text-xs text-muted-foreground">Qty {l.quantity}</p></div><span>{inr(l.line_total)}</span></div>
        ))}</div>
        {q?.errors?.map((e, i) => <p key={i} className="text-xs text-red-700">{e.message}</p>)}
        {q?.coupon_error && <p className="text-xs text-red-700">Coupon: {q.coupon_error}</p>}
        {q ? <Totals q={q} /> : <Spinner />}
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="checkout-terms-checkbox" />I agree to the <Link to="/pages/terms" className="link-u">terms</Link>, <Link to="/pages/shipping" className="link-u">shipping</Link> and <Link to="/pages/returns" className="link-u">return policy</Link>.</label>
        <button className="btn-primary w-full h-12" disabled={busy || !q || q.errors?.length > 0 || (!pay.cod_enabled && !pay.razorpay_enabled)} data-testid="place-order-btn">
          {busy ? <Spinner /> : method === "cod" ? `Place order · ${q ? inr(q.total) : ""}` : `Pay ${q ? inr(q.total) : ""}`}
        </button>
        <p className="text-[11px] text-muted-foreground">Prices, stock and discounts are confirmed securely on our server when you place the order.</p>
      </aside>
    </form>
  );
}
