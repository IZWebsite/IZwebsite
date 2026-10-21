import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { useShop } from "../context/ShopContext";
import { Price } from "./Bits";
import { supabase } from "../lib/supabase";

function QuickView({ product, open, onOpenChange }) {
  const { add } = useShop();
  const [variants, setVariants] = useState(null);
  const [vid, setVid] = useState(null);
  if (open && variants === null && product.variant_count > 0) {
    supabase.from("product_variants").select("*").eq("product_id", product.id).eq("is_active", true).order("sort_order").then(({ data }) => setVariants(data || []));
  }
  const v = (variants || []).find((x) => x.id === vid);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 bg-background gap-0 overflow-hidden" data-testid="quick-view-dialog">
        <div className="grid md:grid-cols-2">
          <img src={product.image_url || "/demo/set.jpg"} alt={product.name} className="w-full aspect-square object-cover" />
          <div className="p-6 md:p-8 flex flex-col">
            <p className="eyebrow mb-2">{product.category_name}</p>
            <DialogTitle className="font-display text-3xl font-normal leading-tight">{product.name}</DialogTitle>
            <Price price={product.price} sale={product.sale_price} className="mt-3 text-lg" />
            {product.variant_count > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {(variants || []).map((x) => (
                  <button key={x.id} disabled={x.stock - x.reserved <= 0} onClick={() => setVid(x.id)}
                    className={`px-3 h-9 text-sm border ${vid === x.id ? "border-foreground bg-foreground text-background" : "border-border"} disabled:opacity-40 disabled:line-through`}>{x.name}</button>
                ))}
              </div>
            )}
            <div className="mt-auto pt-8 flex flex-col gap-3">
              <button className="btn-primary" disabled={product.available <= 0 || (product.variant_count > 0 && !v)}
                onClick={() => add(product, 1, v) && onOpenChange(false)} data-testid="quick-view-add-btn">
                {product.available <= 0 ? "Sold out" : product.variant_count > 0 && !v ? "Choose an option" : "Add to bag"}
              </button>
              <Link to={`/product/${product.slug}`} className="text-sm text-center link-u">View full details</Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductCard({ product, index = 0 }) {
  const { add, toggleWish, inWishlist } = useShop();
  const [qv, setQv] = useState(false);
  const sold = product.available <= 0;
  const low = !sold && product.available <= product.low_stock_threshold;
  return (
    <div className="group reveal" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }} data-testid={`product-card-${product.slug}`}>
      <div className="relative overflow-hidden bg-muted aspect-[4/5] rounded-lg">
        <Link to={`/product/${product.slug}`} aria-label={product.name}>
          <img src={product.image_url || "/demo/set.jpg"} alt={product.name} loading="lazy" decoding="async"
            className={`absolute inset-0 w-full h-full object-cover transition-[transform,opacity] duration-700 group-hover:scale-[1.04] ${sold ? "opacity-60 grayscale-[30%]" : ""}`} />
          {product.hover_image_url && <img src={product.hover_image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500" />}
        </Link>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
          {sold && <span className="chip bg-foreground text-background border-foreground" data-testid="sold-out-badge">Sold out</span>}
          {!sold && product.discount_pct > 0 && <span className="chip bg-[color:var(--gold)] text-white border-transparent">-{product.discount_pct}%</span>}
          {product.is_new && !sold && <span className="chip">New</span>}
          {product.is_anti_tarnish && <span className="chip">Anti-tarnish</span>}
        </div>
        <button onClick={() => toggleWish(product.id)} aria-label="Toggle wishlist" data-testid={`wishlist-btn-${product.slug}`}
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center bg-background/85 backdrop-blur rounded-full hover:bg-background transition-colors">
          <Heart size={16} strokeWidth={1.5} className={inWishlist(product.id) ? "fill-[color:var(--gold)] text-[color:var(--gold)]" : ""} />
        </button>
        <div className="absolute inset-x-3 bottom-3 flex gap-2 md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 transition-[transform,opacity] duration-300">
          <button className="btn-primary h-9 flex-1 px-2 text-xs" disabled={sold}
            onClick={() => (product.variant_count > 0 ? setQv(true) : add(product))} data-testid={`quick-add-btn-${product.slug}`}>
            {sold ? "Sold out" : product.variant_count > 0 ? "Choose" : "Add to bag"}
          </button>
          <button className="h-9 w-9 grid place-items-center bg-background" onClick={() => setQv(true)} aria-label="Quick view" data-testid={`quick-view-btn-${product.slug}`}><Eye size={15} /></button>
        </div>
      </div>
      <Link to={`/product/${product.slug}`} className="block mt-3.5">
        <p className="text-[13px] md:text-sm leading-snug line-clamp-2">{product.name}</p>
        <Price price={product.price} sale={product.sale_price} className="mt-1 text-sm" />
        {low && <p className="text-[11px] text-amber-700 mt-1">Only {product.available} left</p>}
      </Link>
      {qv && <QuickView product={product} open={qv} onOpenChange={setQv} />}
    </div>
  );
}
