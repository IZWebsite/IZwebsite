import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useSeo } from "../lib/seo";
import { track } from "../lib/analytics";
import { geoExtra } from "../lib/geo";
import ProductCard from "../components/ProductCard";
import { Empty, GridSkeleton } from "../components/Bits";

const PER = 24;
const COLLECTIONS = { "anti-tarnish": ["is_anti_tarnish", "Anti-Tarnish Collection"], festive: ["is_festive", "Festive Edit"], new: ["is_new", "New Arrivals"], trending: ["is_trending", "Trending"], bestsellers: ["is_bestseller", "Bestsellers"], sale: ["sale", "On Sale"] };

function Filters({ params, set, categories }) {
  const top = categories.filter((c) => !c.parent_id && c.is_visible);
  return (
    <div className="space-y-8 text-sm">
      <div>
        <p className="label">Category</p>
        <ul className="space-y-2">
          <li><button className={!params.get("category") ? "font-medium" : "text-muted-foreground"} onClick={() => set({ category: null })}>All jewellery</button></li>
          {top.map((c) => (
            <li key={c.id}>
              <button className={params.get("category") === c.slug ? "font-medium" : "text-muted-foreground hover:text-foreground"} onClick={() => set({ category: c.slug })} data-testid={`filter-category-${c.slug}`}>{c.name}</button>
              {categories.filter((s) => s.parent_id === c.id && s.is_visible).map((s) => (
                <button key={s.id} className={`block pl-4 mt-1.5 ${params.get("category") === s.slug ? "font-medium" : "text-muted-foreground hover:text-foreground"}`} onClick={() => set({ category: s.slug })} data-testid={`filter-category-${s.slug}`}>{s.name}</button>
              ))}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label">Collection</p>
        <div className="flex flex-wrap gap-2">{Object.entries(COLLECTIONS).map(([k, [, l]]) => (
          <button key={k} onClick={() => set({ collection: params.get("collection") === k ? null : k })} className={`chip ${params.get("collection") === k ? "bg-foreground text-background" : ""}`} data-testid={`filter-collection-${k}`}>{l}</button>
        ))}</div>
      </div>
      <div>
        <p className="label">Price (₹)</p>
        <div className="flex gap-2">
          <input className="input h-9" inputMode="numeric" placeholder="Min" defaultValue={params.get("min") || ""} onBlur={(e) => set({ min: e.target.value || null })} data-testid="filter-price-min" />
          <input className="input h-9" inputMode="numeric" placeholder="Max" defaultValue={params.get("max") || ""} onBlur={(e) => set({ max: e.target.value || null })} data-testid="filter-price-max" />
        </div>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={params.get("instock") === "1"} onChange={(e) => set({ instock: e.target.checked ? "1" : null })} data-testid="filter-in-stock" />In stock only</label>
    </div>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { categories } = useStore();
  const [res, setRes] = useState({ rows: null, count: 0 });
  const [open, setOpen] = useState(false);
  const page = Number(params.get("page") || 1);
  const cat = categories.find((c) => c.slug === params.get("category"));
  const coll = COLLECTIONS[params.get("collection")];
  const q = params.get("q");
  const heading = q ? `Results for “${q}”` : cat?.name || coll?.[1] || "All Jewellery";
  useSeo({ title: heading, description: cat?.description || `Shop ${heading.toLowerCase()} at IMINATIONZ.` });

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v == null || v === "" ? next.delete(k) : next.set(k, v)));
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  const key = params.toString();
  const slugs = useMemo(() => (cat ? [cat.slug, ...categories.filter((c) => c.parent_id === cat.id).map((c) => c.slug)] : null), [cat, categories]);

  useEffect(() => {
    setRes((r) => ({ ...r, rows: null }));
    let query = supabase.from("catalog").select("*", { count: "exact" }).eq("status", "published");
    if (slugs) query = query.in("category_slug", slugs);
    if (coll) query = coll[0] === "sale" ? query.not("sale_price", "is", null) : query.eq(coll[0], true);
    if (q) {
      const s = q.replace(/[%,()]/g, " ").trim();
      query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%,description.ilike.%${s}%,category_name.ilike.%${s}%,tags.cs.{${s.toLowerCase()}}`);
    }
    const ex = geoExtra();
    if (params.get("min")) query = query.gte("effective_price", Number(params.get("min")) - ex);
    if (params.get("max")) query = query.lte("effective_price", Number(params.get("max")) - ex);
    if (params.get("instock") === "1") query = query.gt("available", 0);
    const sort = params.get("sort") || "newest";
    query = sort === "price_asc" ? query.order("effective_price") : sort === "price_desc" ? query.order("effective_price", { ascending: false }) : sort === "popular" ? query.order("sold_count", { ascending: false }).order("view_count", { ascending: false }) : query.order("created_at", { ascending: false });
    query.range((page - 1) * PER, page * PER - 1).then(({ data, count }) => setRes({ rows: data || [], count: count || 0 }));
    if (q) track("search", { search_query: q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slugs]);

  const pages = Math.ceil(res.count / PER);
  return (
    <div className="container-x py-10 md:py-14" data-testid="shop-page">
      <p className="eyebrow mb-2">Shop</p>
      <div className="flex items-end justify-between gap-4 mb-8 md:mb-12">
        <h1 className="font-display text-4xl md:text-5xl" data-testid="shop-heading">{heading}</h1>
        <p className="text-sm text-muted-foreground hidden sm:block" data-testid="shop-result-count">{res.rows ? `${res.count} pieces` : ""}</p>
      </div>
      <div className="flex items-center justify-between gap-3 mb-6 border-y py-3">
        <button className="lg:hidden flex items-center gap-2 text-sm" onClick={() => setOpen(true)} data-testid="open-filters-btn"><SlidersHorizontal size={16} />Filters</button>
        <span className="hidden lg:block text-xs text-muted-foreground">{q && <button className="link-u" onClick={() => set({ q: null })}>Clear search</button>}</span>
        <select className="input h-9 w-auto" value={params.get("sort") || "newest"} onChange={(e) => set({ sort: e.target.value })} data-testid="sort-select">
          <option value="newest">Newest</option><option value="popular">Popularity</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
        </select>
      </div>
      <div className="grid lg:grid-cols-[220px_1fr] gap-10">
        <aside className="hidden lg:block"><Filters params={params} set={set} categories={categories} /></aside>
        <div>
          {!res.rows ? <GridSkeleton /> : !res.rows.length
            ? <Empty title="No pieces match" text="Try removing a filter or searching for something else." action="Clear all filters" to="/shop" testid="shop-empty" />
            : <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 md:gap-x-6 gap-y-10">{res.rows.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>}
          {pages > 1 && (
            <div className="flex justify-center gap-2 mt-14" data-testid="pagination">
              {Array.from({ length: pages }).map((_, i) => <button key={i} onClick={() => set({ page: String(i + 1) })} className={`h-10 w-10 border text-sm ${page === i + 1 ? "bg-foreground text-background" : ""}`}>{i + 1}</button>)}
            </div>
          )}
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-background overflow-y-auto"><SheetTitle className="font-display text-2xl mb-6">Filters</SheetTitle><Filters params={params} set={(p) => { set(p); }} categories={categories} /><button className="btn-primary w-full mt-8" onClick={() => setOpen(false)}>Show results</button></SheetContent>
      </Sheet>
    </div>
  );
}
