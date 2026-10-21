import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Heart, Minus, Plus, Star, Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { supabase, errMsg } from "../lib/supabase";
import { useShop } from "../context/ShopContext";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { useSeo } from "../lib/seo";
import { track } from "../lib/analytics";
import { getRecent, pushRecent } from "../lib/format";
import ProductCard from "../components/ProductCard";
import { Price, SectionHead, Empty } from "../components/Bits";

function Reviews({ productId, reviews, reload }) {
  const { user } = useAuth();
  const [f, setF] = useState({ rating: 5, title: "", body: "" });
  const submit = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase.rpc("submit_review", { p_product_id: productId, p_rating: f.rating, p_title: f.title, p_body: f.body });
    if (error) return toast.error(errMsg(error));
    toast.success(data.verified ? "Thanks! Your verified review will appear after moderation." : "Thanks! Your review will appear after moderation.");
    setF({ rating: 5, title: "", body: "" }); reload();
  };
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  return (
    <section className="container-x py-16 border-t" data-testid="product-reviews">
      <SectionHead title={avg ? `Reviews · ${avg} / 5` : "Reviews"} />
      <div className="grid md:grid-cols-[1fr_360px] gap-12">
        <div className="space-y-8">
          {!reviews.length && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="border-b pb-6"><div className="flex gap-0.5 mb-2">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < r.rating ? "fill-[color:var(--gold)] text-[color:var(--gold)]" : "text-border"} />)}</div>
              {r.title && <p className="font-medium">{r.title}</p>}<p className="text-sm text-muted-foreground mt-1">{r.body}</p>
              <p className="text-xs mt-2 uppercase tracking-wider">{r.author_name || "Customer"}{r.is_verified && <span className="text-emerald-700"> · Verified purchase</span>}</p></div>
          ))}
        </div>
        {user ? (
          <form onSubmit={submit} className="card-x p-6 space-y-4" data-testid="review-form">
            <p className="font-display text-xl">Write a review</p>
            <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} onClick={() => setF({ ...f, rating: n })} aria-label={`${n} stars`}><Star size={20} className={n <= f.rating ? "fill-[color:var(--gold)] text-[color:var(--gold)]" : "text-border"} /></button>)}</div>
            <input className="input" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="review-title-input" />
            <textarea className="input h-28 py-2" required placeholder="Your experience" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="review-body-input" />
            <button className="btn-primary w-full" data-testid="review-submit-btn">Submit review</button>
          </form>
        ) : <p className="text-sm"><Link to="/login" className="link-u">Log in</Link> to write a review.</p>}
      </div>
    </section>
  );
}

export default function Product() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { add, toggleWish, inWishlist, setCartOpen } = useShop();
  const { settings } = useStore();
  const [d, setD] = useState(null);
  const [img, setImg] = useState(0);
  const [vid, setVid] = useState(null);
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [related, setRelated] = useState([]);
  const [recent, setRecent] = useState([]);

  const load = async () => {
    const { data: p } = await supabase.from("products").select("*, categories(name,slug)").eq("slug", slug).maybeSingle();
    if (!p) return setD({ missing: true });
    const [{ data: images }, { data: variants }, { data: cat }, { data: reviews }] = await Promise.all([
      supabase.from("product_images").select("*").eq("product_id", p.id).order("is_primary", { ascending: false }).order("sort_order"),
      supabase.from("product_variants").select("*").eq("product_id", p.id).eq("is_active", true).order("sort_order"),
      supabase.from("catalog").select("*").eq("id", p.id).single(),
      supabase.from("product_reviews").select("*").eq("product_id", p.id).eq("status", "approved").order("created_at", { ascending: false }),
    ]);
    setD({ ...p, images: images || [], variants: variants || [], c: cat, reviews: reviews || [] });
    if (p.category_id) supabase.from("catalog").select("*").eq("status", "published").eq("category_id", p.category_id).neq("id", p.id).limit(4).then(({ data }) => setRelated(data || []));
    const ids = getRecent().filter((x) => x !== p.id);
    if (ids.length) supabase.from("catalog").select("*").eq("status", "published").in("id", ids.slice(0, 4)).then(({ data }) => setRecent(data || []));
    pushRecent(p.id);
    track("product_view", { product_id: p.id, category_slug: p.categories?.slug });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); setImg(0); setVid(null); setQty(1); load(); }, [slug]);

  const v = d?.variants?.find((x) => x.id === vid);
  const price = v?.price != null ? v.price : d?.price;
  const sale = v?.price != null ? v.sale_price : v?.sale_price ?? d?.sale_price;
  const avail = v ? v.stock - v.reserved : d?.c?.available ?? 0;
  const needVariant = d?.variants?.length > 0 && !v;

  const jsonLd = useMemo(() => d && !d.missing ? {
    "@context": "https://schema.org", "@type": "Product", name: d.name, sku: d.sku, description: d.seo_description || d.description,
    image: d.images.map((i) => new URL(i.url, window.location.origin).href), brand: { "@type": "Brand", name: "IMINATIONZ" },
    offers: { "@type": "Offer", priceCurrency: "INR", price: Number(d.sale_price ?? d.price), availability: (d.c?.available ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: window.location.href },
  } : null, [d]);
  useSeo({ title: d?.seo_title || d?.name, description: d?.seo_description || d?.description?.slice(0, 155), image: d?.images?.[0]?.url, jsonLd });

  if (!d) return <div className="container-x py-14 grid md:grid-cols-2 gap-10 animate-pulse"><div className="aspect-square bg-muted" /><div className="space-y-4"><div className="h-8 bg-muted w-2/3" /><div className="h-5 bg-muted w-1/4" /></div></div>;
  if (d.missing) return <div className="container-x py-20"><Empty title="Product not found" text="This piece may have been removed." action="Back to shop" to="/shop" /></div>;

  const checkPin = () => {
    if (!/^[1-9][0-9]{5}$/.test(pin)) return setPinMsg("Please enter a valid 6-digit PIN code.");
    const pre = (settings.shipping?.pincode_prefixes || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (pre.length && !pre.some((p) => pin.startsWith(p))) return setPinMsg("Sorry, we don't deliver to this PIN code yet.");
    setPinMsg(`Delivery available. ${settings.shipping?.estimate_text || ""}`);
  };
  const specs = [["Material", d.material], ["Finish", d.finish], ["Colour", d.colour], ["Size", d.size], ["Dimensions", d.dimensions], ["Weight", d.weight], ...Object.entries(d.specifications || {})].filter(([, x]) => x);
  const doAdd = () => add({ ...d.c }, qty, v);

  return (
    <div data-testid="product-page">
      <div className="container-x pt-6 text-xs text-muted-foreground"><Link to="/shop">Shop</Link> / {d.categories && <Link to={`/shop?category=${d.categories.slug}`}>{d.categories.name}</Link>}</div>
      <div className="container-x py-8 grid md:grid-cols-[1.1fr_1fr] gap-8 lg:gap-16">
        <div className="md:sticky md:top-24 self-start">
          <div className="aspect-[4/5] bg-muted overflow-hidden"><img src={d.images[img]?.url || "/demo/set.jpg"} alt={d.images[img]?.alt || d.name} className="w-full h-full object-cover" data-testid="product-main-image" /></div>
          {d.images.length > 1 && <div className="flex gap-3 mt-3 overflow-x-auto no-scrollbar">{d.images.map((im, i) => <button key={im.id} onClick={() => setImg(i)} className={`w-20 h-24 shrink-0 border ${i === img ? "border-foreground" : "border-transparent"}`}><img src={im.url} alt={im.alt || ""} loading="lazy" className="w-full h-full object-cover" /></button>)}</div>}
        </div>
        <div>
          <p className="eyebrow mb-3">{d.categories?.name}</p>
          <h1 className="font-display text-4xl lg:text-5xl leading-tight" data-testid="product-name">{d.name}</h1>
          <p className="text-xs text-muted-foreground mt-2">SKU: {v?.sku || d.sku}</p>
          <div className="mt-5 flex items-center gap-3"><Price price={price} sale={sale} className="text-xl" />{sale != null && Number(sale) < Number(price) && <span className="chip bg-[color:var(--gold)] text-white border-transparent">Save {Math.round((1 - sale / price) * 100)}%</span>}</div>
          <p className="text-xs text-muted-foreground mt-1">{settings.tax?.mode === "exclusive" ? `+ ${settings.tax?.label || "GST"} at checkout` : `Inclusive of ${settings.tax?.label || "GST"}`}</p>
          {d.variants.length > 0 && (
            <div className="mt-8"><p className="label">Choose option</p><div className="flex flex-wrap gap-2">{d.variants.map((x) => (
              <button key={x.id} disabled={x.stock - x.reserved <= 0} onClick={() => { setVid(x.id); setQty(1); }} data-testid={`variant-btn-${x.sku}`}
                className={`px-4 h-10 text-sm border transition-colors ${vid === x.id ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"} disabled:opacity-40 disabled:line-through`}>{x.name}</button>
            ))}</div></div>
          )}
          <p className="mt-6 text-sm" data-testid="stock-status">
            {avail <= 0 && !needVariant ? <span className="text-red-700">Sold out</span> : needVariant ? <span className="text-muted-foreground">Select an option to see availability</span> : avail <= d.low_stock_threshold ? <span className="text-amber-700">Only {avail} left — order soon</span> : <span className="text-emerald-700">In stock</span>}
          </p>
          <div className="mt-5 flex gap-3">
            <div className="flex items-center border h-12">
              <button className="px-3 h-full" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease" data-testid="qty-decrease-btn"><Minus size={14} /></button>
              <span className="w-8 text-center" data-testid="qty-value">{qty}</span>
              <button className="px-3 h-full" onClick={() => setQty(Math.min(qty + 1, Math.max(avail, 1), 20))} aria-label="Increase" data-testid="qty-increase-btn"><Plus size={14} /></button>
            </div>
            <button className="btn-primary flex-1 h-12" disabled={needVariant || avail <= 0} onClick={() => doAdd() && setCartOpen(true)} data-testid="add-to-cart-btn">{avail <= 0 && !needVariant ? "Sold out" : "Add to bag"}</button>
            <button className="h-12 w-12 border grid place-items-center" onClick={() => toggleWish(d.id)} aria-label="Wishlist" data-testid="product-wishlist-btn"><Heart size={18} strokeWidth={1.5} className={inWishlist(d.id) ? "fill-[color:var(--gold)] text-[color:var(--gold)]" : ""} /></button>
          </div>
          <button className="btn-gold w-full h-12 mt-3" disabled={needVariant || avail <= 0} onClick={() => doAdd() && nav("/checkout")} data-testid="buy-now-btn">Buy now</button>
          <div className="mt-8 card-x p-4">
            <p className="label">Check delivery</p>
            <div className="flex gap-2"><input className="input h-10" inputMode="numeric" maxLength={6} placeholder="PIN code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} data-testid="pincode-input" /><button className="btn-outline h-10" onClick={checkPin} data-testid="pincode-check-btn">Check</button></div>
            {pinMsg && <p className="text-xs mt-2" data-testid="pincode-result">{pinMsg}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-6 text-[11px] text-center text-muted-foreground">
            <div><Truck className="mx-auto mb-1" size={18} strokeWidth={1.3} />Free shipping above ₹{settings.shipping?.free_above ?? 999}</div>
            <div><RotateCcw className="mx-auto mb-1" size={18} strokeWidth={1.3} />{settings.policies?.return_window_days ?? 7}-day returns</div>
            <div><ShieldCheck className="mx-auto mb-1" size={18} strokeWidth={1.3} />Secure checkout</div>
          </div>
          <Accordion type="multiple" defaultValue={["desc"]} className="mt-8">
            <AccordionItem value="desc"><AccordionTrigger className="font-display text-lg">Description</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{d.description}</AccordionContent></AccordionItem>
            {specs.length > 0 && <AccordionItem value="spec"><AccordionTrigger className="font-display text-lg">Specifications</AccordionTrigger><AccordionContent><dl className="grid grid-cols-2 gap-y-2 text-sm">{specs.map(([k, x]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{String(x)}</dd></div>)}</dl></AccordionContent></AccordionItem>}
            {d.is_anti_tarnish && d.anti_tarnish_info && <AccordionItem value="at"><AccordionTrigger className="font-display text-lg">Anti-tarnish</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">{d.anti_tarnish_info}</AccordionContent></AccordionItem>}
            <AccordionItem value="care"><AccordionTrigger className="font-display text-lg">Care</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">{d.care_instructions || settings.pages?.care?.body}</AccordionContent></AccordionItem>
            <AccordionItem value="ship"><AccordionTrigger className="font-display text-lg">Shipping, returns & warranty</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground space-y-2"><p>{settings.shipping?.estimate_text}</p><p><Link className="link-u" to="/pages/shipping">Shipping policy</Link> · <Link className="link-u" to="/pages/returns">Returns & exchange</Link></p></AccordionContent></AccordionItem>
          </Accordion>
        </div>
      </div>
      <Reviews productId={d.id} reviews={d.reviews} reload={load} />
      {related.length > 0 && <section className="container-x py-16"><SectionHead title="You may also like" /><div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-10">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div></section>}
      {recent.length > 0 && <section className="container-x py-16"><SectionHead title="Recently viewed" /><div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-10">{recent.map((p) => <ProductCard key={p.id} product={p} />)}</div></section>}
    </div>
  );
}
