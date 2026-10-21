import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, X } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { useGeo } from "../lib/geo";
import { useShop } from "../context/ShopContext";
import { useSeo } from "../lib/seo";
import { inr } from "../lib/format";
import { Empty, Spinner } from "../components/Bits";

export function useQuote(items, coupon, email) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);
  const sig = JSON.stringify(items.map((i) => [i.product_id, i.variant_id, i.quantity])) + coupon + email + useGeo().extra;
  useEffect(() => {
    if (!items.length) { setQ(null); return; }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("quote_cart", { p_items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })), p_coupon: coupon || null, p_email: email || null });
      if (error) setErr(errMsg(error)); else { setErr(null); setQ(data); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return { q, err };
}

export const Totals = ({ q }) => (
  <dl className="space-y-2 text-sm" data-testid="order-totals">
    <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid="totals-subtotal">{inr(q.subtotal)}</dd></div>
    {Number(q.discount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {q.coupon_code && `(${q.coupon_code})`}</dt><dd data-testid="totals-discount">−{inr(q.discount)}</dd></div>}
    <div className="flex justify-between"><dt>Shipping</dt><dd data-testid="totals-shipping">{Number(q.shipping) ? inr(q.shipping) : "Free"}</dd></div>
    <div className="flex justify-between text-muted-foreground"><dt>GST {q.tax_rate}% {q.tax_inclusive ? "(included)" : ""}</dt><dd>{inr(q.tax)}</dd></div>
    <div className="flex justify-between border-t pt-3 text-base font-medium"><dt>Total</dt><dd data-testid="totals-total">{inr(q.total)}</dd></div>
  </dl>
);

export default function Cart() {
  const { items, setQty, remove } = useShop();
  const [code, setCode] = useState(sessionStorage.getItem("imz_coupon") || "");
  const [applied, setApplied] = useState(sessionStorage.getItem("imz_coupon") || "");
  const { q, err } = useQuote(items, applied, "");
  const nav = useNavigate();
  useSeo({ title: "Your Bag", noindex: true });
  if (!items.length) return <div className="container-x py-20"><Empty title="Your bag is empty" text="Discover pieces you'll love." action="Start shopping" to="/shop" testid="cart-empty" /></div>;
  const lineErr = (i) => q?.errors?.find((e) => e.product_id === i.product_id && (!e.variant_id || e.variant_id === i.variant_id));
  const apply = () => { const c = code.trim().toUpperCase(); setApplied(c); sessionStorage.setItem("imz_coupon", c); };
  return (
    <div className="container-x py-10 md:py-14" data-testid="cart-page">
      <h1 className="font-display text-4xl md:text-5xl mb-10">Your Bag</h1>
      <div className="grid lg:grid-cols-[1fr_380px] gap-12">
        <div className="divide-y border-y">
          {items.map((i) => {
            const e = lineErr(i); const line = q?.lines?.find((l) => l.product_id === i.product_id && (l.variant_id || null) === (i.variant_id || null));
            return (
              <div key={`${i.product_id}${i.variant_id}`} className="py-6 flex gap-4 md:gap-6" data-testid="cart-item">
                <Link to={`/product/${i.slug}`}><img src={i.image_url || "/demo/set.jpg"} alt={i.name} className="w-24 h-28 md:w-28 md:h-32 object-cover bg-muted" /></Link>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-4"><Link to={`/product/${i.slug}`} className="leading-snug">{i.name}</Link><button onClick={() => remove(i)} aria-label="Remove" data-testid="cart-remove-btn"><X size={16} /></button></div>
                  {i.variant_name && <p className="text-xs text-muted-foreground mt-1">{i.variant_name}</p>}
                  <p className="text-sm mt-1">{inr(line?.unit_price ?? i.price)}</p>
                  {e && <p className="text-xs text-red-700 mt-1" data-testid="cart-item-error">{e.message}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center border">
                      <button className="p-2" onClick={() => setQty(i, i.quantity - 1)} aria-label="Decrease" data-testid="cart-qty-decrease"><Minus size={12} /></button>
                      <span className="w-8 text-center text-sm" data-testid="cart-qty">{i.quantity}</span>
                      <button className="p-2" onClick={() => setQty(i, i.quantity + 1)} aria-label="Increase" data-testid="cart-qty-increase"><Plus size={12} /></button>
                    </div>
                    {line && <span className="text-sm font-medium">{inr(line.line_total)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <aside className="card-x p-6 h-fit lg:sticky lg:top-24 space-y-6">
          <div>
            <p className="label">Coupon code</p>
            <div className="flex gap-2"><input className="input h-10 uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code" data-testid="coupon-input" /><button className="btn-outline h-10" onClick={apply} data-testid="coupon-apply-btn">Apply</button></div>
            {applied && q?.coupon_error && <p className="text-xs text-red-700 mt-2" data-testid="coupon-error">{q.coupon_error}</p>}
            {applied && q && !q.coupon_error && <p className="text-xs text-emerald-700 mt-2" data-testid="coupon-success">Coupon {applied} applied{q.free_shipping ? " — free shipping" : ""}</p>}
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          {q ? <Totals q={q} /> : <Spinner />}
          <button className="btn-primary w-full" disabled={!q || q.errors?.length > 0} onClick={() => nav("/checkout")} data-testid="checkout-btn">Proceed to checkout</button>
          {q?.errors?.length > 0 && <p className="text-xs text-red-700">Please fix the items marked above to continue.</p>}
        </aside>
      </div>
    </div>
  );
}
