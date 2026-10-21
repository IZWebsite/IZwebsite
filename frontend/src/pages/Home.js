import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Banknote, Truck, RotateCcw, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useSeo } from "../lib/seo";
import { getRecent } from "../lib/format";
import ProductCard from "../components/ProductCard";
import { SectionHead, GridSkeleton } from "../components/Bits";
import { DEFAULT_SECTIONS } from "../lib/defaults";

function Hero() {
  const { banners } = useStore();
  const heroes = banners.filter((b) => b.placement === "hero");
  const [i, setI] = useState(0);
  useEffect(() => {
    if (heroes.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % heroes.length), 6000);
    return () => clearInterval(t);
  }, [heroes.length]);
  const h = heroes[i] || { id: "default", title: "Jewellery that carries your story", subtitle: "Premium imitation and anti-tarnish pieces, designed in India for every day and every celebration.", image_url: "/demo/hero.jpg", cta_label: "Shop the collection", cta_url: "/shop" };
  if (!h.title) return (
    <section className="relative bg-[#2b2420]" data-testid="home-hero">
      <Link to={h.cta_url || "/shop"} aria-label={h.cta_label || "Shop the collection"} data-testid="hero-cta-btn"><img key={h.id} src={h.image_url} alt={h.subtitle || "IMINATIONZ jewellery"} className="w-full h-auto block reveal" fetchPriority="high" /></Link>
      {heroes.length > 1 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">{heroes.map((x, n) => <button key={x.id} aria-label={`Slide ${n + 1}`} onClick={() => setI(n)} className={`h-[3px] w-8 rounded-full ${n === i ? "bg-white" : "bg-white/40"}`} />)}</div>}
    </section>
  );
  return (
    <section className="relative overflow-hidden bg-[#2b2420]" data-testid="home-hero">
      <div className="relative h-[64vh] sm:h-[70vh] lg:h-[84vh] min-h-[420px] max-h-[860px]">
        <img key={h.id} src={h.image_url || "/demo/hero.jpg"} alt={h.title || "IMINATIONZ jewellery"} className="absolute inset-0 w-full h-full object-cover object-[72%_center] md:object-center reveal" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
        <div className="relative h-full container-x flex flex-col justify-end md:justify-center pb-12 md:pb-0">
          <div className="max-w-xl text-white reveal" key={h.id}>
            <p className="text-[11px] uppercase tracking-[0.34em] text-[color:var(--champagne)] mb-5 flex items-center gap-3">IMINATIONZ<span className="h-px w-10 bg-[color:var(--gold)]" /></p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.02] font-normal">{h.title}</h1>
            {h.subtitle && <p className="mt-5 text-sm md:text-base text-white/80 max-w-md leading-relaxed">{h.subtitle}</p>}
            {h.cta_label && <Link to={h.cta_url || "/shop"} className="inline-flex items-center mt-7 md:mt-9 h-11 md:h-12 px-7 md:px-9 rounded-full border border-white/50 bg-white/10 backdrop-blur-md text-xs uppercase tracking-[0.24em] hover:bg-white hover:text-foreground transition-colors" data-testid="hero-cta-btn">{h.cta_label}</Link>}
          </div>
          {heroes.length > 1 && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">{heroes.map((x, n) => <button key={x.id} aria-label={`Slide ${n + 1}`} onClick={() => setI(n)} className={`h-[3px] w-8 rounded-full transition-colors ${n === i ? "bg-white" : "bg-white/35"}`} />)}</div>}
        </div>
      </div>
    </section>
  );
}

function Marquee({ s }) {
  const { settings } = useStore();
  const items = (s.body ? s.body.split("\n") : [`Free shipping on orders above ₹${settings.shipping?.free_above ?? 999}`, "Cash on delivery available", `${settings.policies?.return_window_days ?? 7}-day easy returns`, "Anti-tarnish collection now live", "Designed in India"]).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="bg-[#2b2420] text-[#efe6d8] overflow-hidden py-3.5 border-t border-white/10" data-testid="home-section-marquee">
      <div className="flex w-max animate-marquee">{[0, 1].map((r) => (
        <div key={r} className="flex shrink-0" aria-hidden={r === 1}>{items.map((t, i) => <span key={i} className="px-10 text-[11px] md:text-xs uppercase tracking-[0.22em] whitespace-nowrap flex items-center gap-10">{t}<span className="text-[color:var(--gold)]">✦</span></span>)}</div>
      ))}</div>
    </div>
  );
}

const FEAT_ICONS = [Banknote, Truck, RotateCcw, Sparkles];
function Features({ s }) {
  const { settings } = useStore();
  const items = (s.body ? s.body.split("\n").filter((x) => x.trim()).map((x) => x.split("|").map((y) => y.trim())) : [
    ["Cash on Delivery", "Pay when your order arrives"], ["Free Shipping", `On orders above ₹${settings.shipping?.free_above ?? 999}`],
    [`${settings.policies?.return_window_days ?? 7}-Day Returns`, "Easy returns & exchange"], ["Anti-Tarnish", "Everyday shine that lasts"],
  ]).slice(0, 4);
  return (
    <section className="border-y bg-card" data-testid="home-section-features">
      <div className="container-x grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6 py-7 md:py-8">{items.map(([t, d], i) => {
        const I = FEAT_ICONS[i % 4];
        return <div key={i} className="flex items-start gap-3"><I size={26} strokeWidth={1.3} className="text-[color:var(--gold)] shrink-0" /><div><p className="text-sm font-medium">{t}</p>{d && <p className="text-xs text-muted-foreground mt-0.5">{d}</p>}</div></div>;
      })}</div>
    </section>
  );
}

const Rail = ({ items, testid }) => (
  <div className="flex lg:grid lg:grid-cols-4 gap-3 md:gap-5 lg:gap-y-10 overflow-x-auto lg:overflow-visible no-scrollbar snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 lg:scroll-px-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-1" data-testid={testid}>
    {items.map((p, n) => <div key={p.id} className="shrink-0 w-[46%] sm:w-[31%] md:w-[30%] lg:w-auto snap-start"><ProductCard product={p} index={n} /></div>)}
  </div>
);

const Row = ({ s, items, loading }) => {
  if (!loading && !items.length) return null;
  return (
    <section className="container-x py-10 md:py-14 lg:py-20" data-testid={`home-section-${s.section_key}`}>
      <SectionHead eyebrow={s.subtitle} title={s.title} action={s.cta_label} to={s.cta_url} />
      {loading ? <GridSkeleton n={4} /> : <Rail items={items.slice(0, 8)} testid={`rail-${s.section_key}`} />}
      {s.cta_label && s.cta_url && <div className="text-center mt-7 md:hidden"><Link to={s.cta_url} className="btn-primary rounded-md px-8">{s.cta_label}</Link></div>}
    </section>
  );
};

function Categories({ s }) {
  const { categories } = useStore();
  const ref = useRef(null);
  const slide = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  const [over, setOver] = useState(false);
  useEffect(() => {
    const f = () => setOver(!!ref.current && ref.current.scrollWidth > ref.current.clientWidth + 4);
    f(); window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [categories]);
  const featured = categories.filter((c) => c.is_featured && c.is_visible);
  const list = featured.length ? featured : categories.filter((c) => c.is_visible);
  if (!list.length) return null;
  return (
    <section className="container-x pt-8 md:pt-12 lg:pt-14 pb-4" data-testid="home-section-categories">
      {s.title && <SectionHead eyebrow={s.subtitle} title={s.title} action="All categories" to="/shop" />}
      <div className="relative group/row">
      {over && [-1, 1].map((d) => (
        <button key={d} onClick={() => slide(d)} aria-label={d < 0 ? "Previous categories" : "Next categories"} className={`hidden md:flex absolute top-[38%] -translate-y-1/2 z-10 h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-md border hover:bg-[#2b2420] hover:text-white transition-colors ${d < 0 ? "-left-5" : "-right-5"}`} data-testid={d < 0 ? "category-prev-btn" : "category-next-btn"}>{d < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>
      ))}
      <div ref={ref} className="flex gap-3 md:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 lg:scroll-px-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-2" data-testid="category-scroll-row">
        {list.map((c, n) => (
          <Link key={c.id} to={`/shop?category=${c.slug}`} className="group shrink-0 snap-start w-[28%] sm:w-[22%] md:w-[18%] lg:w-44 xl:w-48 text-center" data-testid={`category-tile-${c.slug}`}>
            <div className="overflow-hidden rounded-xl bg-muted aspect-square"><img src={c.image_url || CAT_FALLBACK[n % CAT_FALLBACK.length]} alt={c.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /></div>
            <p className="mt-2.5 text-[11px] md:text-xs uppercase tracking-[0.18em] group-hover:text-[color:var(--gold)] transition-colors truncate">{c.name}</p>
          </Link>
        ))}
      </div>
      </div>
    </section>
  );
}

function Promo() {
  const { banners } = useStore();
  const list = banners.filter((b) => b.placement === "promo");
  if (!list.length) return null;
  return (
    <section className="container-x py-8 md:py-10 grid gap-3 md:gap-4 md:grid-cols-2" data-testid="home-section-promo">
      {list.map((b) => (
        <Link key={b.id} to={b.cta_url || "/shop"} className={`relative group overflow-hidden rounded-lg min-h-[240px] sm:min-h-[300px] lg:min-h-[360px] flex items-end ${list.length === 1 ? "md:col-span-2" : ""}`}>
          <img src={b.image_url || "/demo/chain.jpg"} alt={b.title || ""} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="relative p-6 md:p-10 lg:p-12 text-white"><p className="font-display text-2xl sm:text-3xl lg:text-4xl">{b.title}</p>{b.subtitle && <p className="mt-2 text-sm opacity-90">{b.subtitle}</p>}{b.cta_label && <span className="inline-block mt-5 text-sm border-b border-white pb-0.5">{b.cta_label}</span>}</div>
        </Link>
      ))}
    </section>
  );
}

const CAT_FALLBACK = ["/demo/jhumka.jpg", "/demo/necklace.jpg", "/demo/rings.jpg", "/demo/bracelet.jpg", "/demo/set.jpg", "/demo/chain.jpg"];

function Offer({ s, items }) {
  if (!s.title && !s.body) return null;
  return (
    <section className="container-x py-10 md:py-14 lg:py-20" data-testid="home-section-offer">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 mb-6 md:mb-8 lg:mb-10">
        <div>{s.body && <p className="text-sm md:text-base text-muted-foreground mb-2 md:mb-3">{s.body}</p>}<h2 className="font-display text-3xl md:text-4xl lg:text-5xl">{s.title}</h2>{s.subtitle && <p className="eyebrow mt-3">{s.subtitle}</p>}</div>
        {s.cta_label && <Link to={s.cta_url || "/shop"} className="btn-primary rounded-md px-8 self-start md:self-auto" data-testid="offer-cta-btn">{s.cta_label}</Link>}
      </div>
      {items.length > 0 && <Rail items={items.slice(0, 4)} testid="rail-offer" />}
    </section>
  );
}

function Tabs({ s, p }) {
  const tabs = [["Festive", p.filter((x) => x.is_festive)], ["Anti-Tarnish", p.filter((x) => x.is_anti_tarnish)], ["Trending", p.filter((x) => x.is_trending)], ["On Sale", p.filter((x) => x.sale_price != null)]].filter(([, l]) => l.length);
  const [t, setT] = useState(0);
  if (!tabs.length) return null;
  const cur = tabs[Math.min(t, tabs.length - 1)];
  return (
    <section className="container-x py-10 md:py-14 lg:py-20" data-testid="home-section-tabs">
      <h2 className="font-display text-3xl md:text-4xl lg:text-5xl text-center">{s.title || "Shop by Mood"}</h2>
      <div className="flex sm:justify-center gap-6 md:gap-10 mt-5 md:mt-6 mb-6 md:mb-10 overflow-x-auto no-scrollbar -mx-4 px-4">{tabs.map(([l], i) => (
        <button key={l} onClick={() => setT(i)} className={`pb-2 text-sm md:text-base whitespace-nowrap border-b-2 transition-colors ${cur[0] === l ? "border-[color:var(--gold)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`} data-testid={`home-tab-${l.toLowerCase().replace(/\s+/g, "-")}`}>{l}</button>
      ))}</div>
      <Rail key={cur[0]} items={cur[1].slice(0, 8)} testid="rail-tabs" />
    </section>
  );
}

function Testimonials({ s }) {
  const [reviews, setReviews] = useState([]);
  useEffect(() => { supabase.from("product_reviews").select("id,author_name,rating,title,body,is_verified").eq("status", "approved").gte("rating", 4).order("created_at", { ascending: false }).limit(6).then(({ data }) => setReviews(data || [])); }, []);
  const manual = (s.body || "").split("\n").filter((x) => x.includes("|")).map((x, i) => { const [a, b] = x.split("|").map((y) => y.trim()); return { id: `m${i}`, author_name: a, rating: 5, body: b }; });
  const list = reviews.length ? reviews : manual;
  if (!list.length) return null;
  return (
    <section className="container-x py-10 md:py-14 lg:py-20" data-testid="home-section-testimonials">
      <SectionHead title={s.title} />
      <div className="flex lg:grid lg:grid-cols-3 gap-4 md:gap-6 overflow-x-auto lg:overflow-visible no-scrollbar snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">{list.map((r) => (
        <figure key={r.id} className="card-x p-6 md:p-8 shrink-0 w-[82%] sm:w-[46%] lg:w-auto snap-start"><div className="flex gap-0.5 mb-4">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={14} className="fill-[color:var(--gold)] text-[color:var(--gold)]" />)}</div>
          <blockquote className="font-display text-lg md:text-xl leading-snug">{r.title || r.body}</blockquote>{r.title && <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{r.body}</p>}
          <figcaption className="text-xs uppercase tracking-wider mt-5">{r.author_name}{r.is_verified && " · Verified buyer"}</figcaption></figure>
      ))}</div>
    </section>
  );
}

const Story = ({ s }) => (
  <section className="container-x py-10 md:py-16 lg:py-24 grid md:grid-cols-2 gap-6 md:gap-10 lg:gap-20 items-center" data-testid="home-section-story">
    {s.image_url && <img src={s.image_url} alt="IMINATIONZ brand story" loading="lazy" className="w-full aspect-[4/3] md:aspect-[4/5] object-cover rounded-lg" />}
    <div><p className="eyebrow mb-3 md:mb-4">{s.subtitle}</p><h2 className="font-display text-3xl md:text-4xl lg:text-5xl italic leading-tight">{s.title}</h2><p className="mt-4 md:mt-6 text-sm md:text-base text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>{s.cta_label && <Link to={s.cta_url || "/pages/about"} className="btn-outline mt-6 md:mt-8">{s.cta_label}</Link>}</div>
  </section>
);

const Care = ({ s }) => (
  <section className="border-y py-8 md:py-12" data-testid="home-section-care">
    <div className="container-x flex flex-col md:flex-row md:items-center gap-3 md:gap-6 justify-between">
      <h2 className="font-display text-2xl md:text-3xl">{s.title}</h2>
      <p className="text-sm text-muted-foreground flex-1 md:px-6 lg:px-10">{s.body}</p>
      {s.cta_label && <Link to={s.cta_url || "/pages/care"} className="text-sm link-u">{s.cta_label} →</Link>}
    </div>
  </section>
);

function Newsletter({ s }) {
  const [email, setEmail] = useState(""); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc("subscribe_newsletter", { p_email: email, p_consent: consent });
    setBusy(false);
    if (error) toast.error(errMsg(error)); else { toast.success("You're on the list"); setEmail(""); setConsent(false); }
  };
  return (
    <section className="container-x py-12 md:py-16 lg:py-20 text-center max-w-2xl" data-testid="home-section-newsletter">
      <h2 className="font-display text-3xl md:text-4xl">{s.title}</h2><p className="text-sm text-muted-foreground mt-3">{s.subtitle}</p>
      <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3">
        <input type="email" required className="input flex-1" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="newsletter-email-input" />
        <button className="btn-primary" disabled={busy || !consent} data-testid="newsletter-submit-btn">Subscribe</button>
      </form>
      <label className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="newsletter-consent-checkbox" />I agree to receive emails from IMINATIONZ.</label>
    </section>
  );
}

function withNewSections(sections) {
  if (!sections.length) return DEFAULT_SECTIONS;
  const has = (k) => sections.some((s) => s.section_key === k);
  const def = (k) => DEFAULT_SECTIONS.find((d) => d.section_key === k);
  const out = [...sections];
  [["marquee", "hero"], ["features", "categories"], ["tabs", "new_arrivals"]].forEach(([k, after]) => {
    if (has(k)) return;
    const i = out.findIndex((s) => s.section_key === after);
    out.splice(i < 0 ? 1 : i + 1, 0, def(k));
  });
  return out;
}

export default function Home() {
  const { sections } = useStore();
  const [products, setProducts] = useState(null);
  const [recent, setRecent] = useState([]);
  useSeo({});
  useEffect(() => {
    supabase.from("catalog").select("*").eq("status", "published").order("created_at", { ascending: false }).limit(60).then(({ data }) => setProducts(data || []));
    const ids = getRecent();
    if (ids.length) supabase.from("catalog").select("*").eq("status", "published").in("id", ids).then(({ data }) => setRecent(ids.map((id) => (data || []).find((p) => p.id === id)).filter(Boolean)));
  }, []);
  const p = products || [];
  const lists = {
    new_arrivals: [...p.filter((x) => x.is_new), ...p.filter((x) => !x.is_new)],
    bestsellers: [...p].sort((a, b) => (b.is_bestseller - a.is_bestseller) || b.sold_count - a.sold_count),
    trending: p.filter((x) => x.is_trending),
    festive: p.filter((x) => x.is_festive),
    recently_viewed: recent,
  };
  return (
    <div data-testid="home-page">
      {withNewSections(sections).filter((s) => s.is_visible).map((s) => {
        const k = s.section_key;
        if (k === "hero") return <Hero key={k} />;
        if (k === "categories") return <Categories key={k} s={s} />;
        if (k === "promo") return <Promo key={k} />;
        if (k === "offer") return <Offer key={k} s={s} items={p.filter((x) => x.sale_price != null)} />;
        if (k === "marquee") return <Marquee key={k} s={s} />;
        if (k === "features") return <Features key={k} s={s} />;
        if (k === "tabs") return <Tabs key={k} s={s} p={p} />;
        if (k === "testimonials") return <Testimonials key={k} s={s} />;
        if (k === "story") return <Story key={k} s={s} />;
        if (k === "care") return <Care key={k} s={s} />;
        if (k === "newsletter") return <Newsletter key={k} s={s} />;
        if (lists[k]) return <Row key={k} s={s} items={lists[k]} loading={!products && k !== "recently_viewed"} />;
        return null;
      })}
    </div>
  );
}
