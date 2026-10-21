import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
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
  return (
    <section className="relative grain overflow-hidden" data-testid="home-hero">
      <div className="grid lg:grid-cols-[1.05fr_1fr] min-h-[78vh]">
        <div className="order-2 lg:order-1 flex items-center bg-secondary/60">
          <div className="container-x lg:pl-16 xl:pl-24 py-14 lg:py-0 max-w-2xl reveal" key={h.id}>
            <p className="eyebrow mb-6">New season · Handpicked in India</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] font-normal">{h.title}</h1>
            {h.subtitle && <p className="mt-6 text-base text-muted-foreground max-w-md leading-relaxed">{h.subtitle}</p>}
            {h.cta_label && <Link to={h.cta_url || "/shop"} className="btn-primary mt-10 px-9" data-testid="hero-cta-btn">{h.cta_label}</Link>}
            {heroes.length > 1 && <div className="flex gap-2 mt-10">{heroes.map((x, n) => <button key={x.id} aria-label={`Slide ${n + 1}`} onClick={() => setI(n)} className={`h-[2px] w-10 ${n === i ? "bg-foreground" : "bg-foreground/20"}`} />)}</div>}
          </div>
        </div>
        <div className="order-1 lg:order-2 relative min-h-[52vh] lg:min-h-0">
          <img src={h.image_url || "/demo/hero.jpg"} alt={h.title || "IMINATIONZ jewellery"} className="absolute inset-0 w-full h-full object-cover" fetchpriority="high" />
        </div>
      </div>
    </section>
  );
}

const Row = ({ s, items, loading }) => {
  if (!loading && !items.length) return null;
  return (
    <section className="container-x py-16 md:py-20" data-testid={`home-section-${s.section_key}`}>
      <SectionHead eyebrow={s.subtitle} title={s.title} action={s.cta_label} to={s.cta_url} />
      {loading ? <GridSkeleton n={4} /> : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-10">{items.slice(0, 8).map((p, n) => <ProductCard key={p.id} product={p} index={n} />)}</div>}
    </section>
  );
};

function Categories({ s }) {
  const { categories } = useStore();
  const list = categories.filter((c) => c.is_featured && c.is_visible).slice(0, 6);
  if (!list.length) return null;
  return (
    <section className="container-x py-16 md:py-24" data-testid="home-section-categories">
      <SectionHead eyebrow={s.subtitle} title={s.title} action="All categories" to="/shop" />
      <div className="flex md:grid md:grid-cols-6 gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {list.map((c) => (
          <Link key={c.id} to={`/shop?category=${c.slug}`} className="group shrink-0 w-[38vw] md:w-auto" data-testid={`category-tile-${c.slug}`}>
            <div className="aspect-[3/4] overflow-hidden bg-muted"><img src={c.image_url || "/demo/set.jpg"} alt={c.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /></div>
            <p className="font-display text-xl mt-3 text-center">{c.name}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Promo() {
  const { banners } = useStore();
  const list = banners.filter((b) => b.placement === "promo");
  if (!list.length) return null;
  return (
    <section className="container-x py-10 grid gap-4 md:grid-cols-2" data-testid="home-section-promo">
      {list.map((b) => (
        <Link key={b.id} to={b.cta_url || "/shop"} className={`relative group overflow-hidden min-h-[320px] flex items-end ${list.length === 1 ? "md:col-span-2" : ""}`}>
          <img src={b.image_url || "/demo/chain.jpg"} alt={b.title || ""} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="relative p-8 md:p-12 text-white"><p className="font-display text-3xl md:text-4xl">{b.title}</p>{b.subtitle && <p className="mt-2 text-sm opacity-90">{b.subtitle}</p>}{b.cta_label && <span className="inline-block mt-5 text-sm border-b border-white pb-0.5">{b.cta_label}</span>}</div>
        </Link>
      ))}
    </section>
  );
}

function Offer({ s }) {
  if (!s.title && !s.body) return null;
  return (
    <section className="bg-[color:var(--champagne)]/50 py-14 my-6" data-testid="home-section-offer">
      <div className="container-x flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div><p className="eyebrow mb-2">{s.subtitle}</p><h2 className="font-display text-3xl md:text-4xl">{s.title}</h2>{s.body && <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>}</div>
        {s.cta_label && <Link to={s.cta_url || "/shop"} className="btn-outline">{s.cta_label}</Link>}
      </div>
    </section>
  );
}

function Testimonials({ s }) {
  const [reviews, setReviews] = useState([]);
  useEffect(() => { supabase.from("product_reviews").select("id,author_name,rating,title,body,is_verified").eq("status", "approved").gte("rating", 4).order("created_at", { ascending: false }).limit(6).then(({ data }) => setReviews(data || [])); }, []);
  if (!reviews.length) return null;
  return (
    <section className="container-x py-16 md:py-20" data-testid="home-section-testimonials">
      <SectionHead title={s.title} />
      <div className="grid md:grid-cols-3 gap-6">{reviews.map((r) => (
        <figure key={r.id} className="card-x p-8"><div className="flex gap-0.5 mb-4">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={14} className="fill-[color:var(--gold)] text-[color:var(--gold)]" />)}</div>
          <blockquote className="font-display text-xl leading-snug">{r.title || r.body}</blockquote>{r.title && <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{r.body}</p>}
          <figcaption className="text-xs uppercase tracking-wider mt-5">{r.author_name}{r.is_verified && " · Verified buyer"}</figcaption></figure>
      ))}</div>
    </section>
  );
}

const Story = ({ s }) => (
  <section className="container-x py-16 md:py-24 grid md:grid-cols-2 gap-10 md:gap-20 items-center" data-testid="home-section-story">
    {s.image_url && <img src={s.image_url} alt="IMINATIONZ brand story" loading="lazy" className="w-full aspect-[4/5] object-cover" />}
    <div><p className="eyebrow mb-4">{s.subtitle}</p><h2 className="font-display text-4xl md:text-5xl italic leading-tight">{s.title}</h2><p className="mt-6 text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>{s.cta_label && <Link to={s.cta_url || "/pages/about"} className="btn-outline mt-8">{s.cta_label}</Link>}</div>
  </section>
);

const Care = ({ s }) => (
  <section className="border-y py-12" data-testid="home-section-care">
    <div className="container-x flex flex-col md:flex-row md:items-center gap-6 justify-between">
      <h2 className="font-display text-2xl md:text-3xl">{s.title}</h2>
      <p className="text-sm text-muted-foreground flex-1 md:px-10">{s.body}</p>
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
    <section className="container-x py-20 text-center max-w-2xl" data-testid="home-section-newsletter">
      <h2 className="font-display text-4xl">{s.title}</h2><p className="text-sm text-muted-foreground mt-3">{s.subtitle}</p>
      <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3">
        <input type="email" required className="input flex-1" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="newsletter-email-input" />
        <button className="btn-primary" disabled={busy || !consent} data-testid="newsletter-submit-btn">Subscribe</button>
      </form>
      <label className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="newsletter-consent-checkbox" />I agree to receive emails from IMINATIONZ.</label>
    </section>
  );
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
      {(sections.length ? sections : DEFAULT_SECTIONS).filter((s) => s.is_visible).map((s) => {
        const k = s.section_key;
        if (k === "hero") return <Hero key={k} />;
        if (k === "categories") return <Categories key={k} s={s} />;
        if (k === "promo") return <Promo key={k} />;
        if (k === "offer") return <Offer key={k} s={s} />;
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
