import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { geoExtra, useGeo } from "../lib/geo";
import { track } from "../lib/analytics";
import { useAuth } from "./AuthContext";

const Ctx = createContext(null);
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const key = (i) => `${i.product_id}:${i.variant_id || ""}`;

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState(() => read("imz_cart"));
  const [wishlist, setWishlist] = useState(() => read("imz_wish"));
  const [cartOpen, setCartOpen] = useState(false);
  const synced = useRef(null);
  const { extra } = useGeo();

  // refresh stored cart prices when the location price changes
  const lastExtra = useRef(extra);
  useEffect(() => {
    const d = extra - lastExtra.current;
    lastExtra.current = extra;
    if (d) setItems((prev) => prev.map((i) => ({ ...i, price: Number(i.price || 0) + d })));
  }, [extra]);

  // merge guest cart/wishlist into the account on login, then load server copy
  useEffect(() => {
    if (!user || synced.current === user.id) return;
    synced.current = user.id;
    (async () => {
      const { data: rows } = await supabase.from("cart_items").select("product_id,variant_id,quantity").eq("user_id", user.id);
      const map = new Map((rows || []).map((r) => [key(r), r]));
      read("imz_cart").forEach((i) => { const ex = map.get(key(i)); map.set(key(i), { ...i, quantity: Math.max(i.quantity, ex?.quantity || 0) }); });
      const ids = [...new Set([...map.values()].map((i) => i.product_id))];
      const { data: prods } = ids.length ? await supabase.from("catalog").select("id,name,slug,image_url,effective_price,available").in("id", ids) : { data: [] };
      const pm = Object.fromEntries((prods || []).map((p) => [p.id, p]));
      setItems([...map.values()].filter((i) => pm[i.product_id]).map((i) => {
        const local = read("imz_cart").find((x) => key(x) === key(i));
        return { ...local, product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity, name: pm[i.product_id].name, slug: pm[i.product_id].slug, image_url: pm[i.product_id].image_url, price: local?.price ?? Number(pm[i.product_id].effective_price) + geoExtra() };
      }));
      const { data: w } = await supabase.from("wishlists").select("product_id").eq("user_id", user.id);
      const merged = [...new Set([...(w || []).map((x) => x.product_id), ...read("imz_wish")])];
      setWishlist(merged);
      const add = merged.filter((id) => !(w || []).some((x) => x.product_id === id));
      if (add.length) await supabase.from("wishlists").upsert(add.map((product_id) => ({ user_id: user.id, product_id })));
    })();
  }, [user]);

  useEffect(() => { if (!user) synced.current = null; }, [user]);

  useEffect(() => {
    localStorage.setItem("imz_cart", JSON.stringify(items));
    if (!user || synced.current !== user.id) return;
    const t = setTimeout(async () => {
      await supabase.from("cart_items").delete().eq("user_id", user.id);
      if (items.length) await supabase.from("cart_items").insert(items.map((i) => ({ user_id: user.id, product_id: i.product_id, variant_id: i.variant_id || null, quantity: i.quantity })));
    }, 600);
    return () => clearTimeout(t);
  }, [items, user]);

  useEffect(() => { localStorage.setItem("imz_wish", JSON.stringify(wishlist)); }, [wishlist]);

  const add = (product, qty = 1, variant = null) => {
    const available = variant ? variant.stock - variant.reserved : product.available;
    if (available <= 0) { toast.error("Sorry, this piece is sold out"); return false; }
    const entry = { product_id: product.id, variant_id: variant?.id || null, name: product.name, slug: product.slug, image_url: product.image_url, variant_name: variant?.name || null, price: Number(variant?.price != null ? (variant.sale_price ?? variant.price) : (variant?.sale_price ?? product.effective_price)) + geoExtra(), max: available };
    setItems((prev) => {
      const ex = prev.find((i) => key(i) === key(entry));
      const nextQty = Math.min((ex?.quantity || 0) + qty, available, 20);
      return ex ? prev.map((i) => (key(i) === key(entry) ? { ...i, ...entry, quantity: nextQty } : i)) : [...prev, { ...entry, quantity: Math.min(qty, available) }];
    });
    track("add_to_cart", { product_id: product.id, category_slug: product.category_slug });
    toast.success("Added to your bag", { description: product.name });
    return true;
  };

  const value = {
    items, cartOpen, setCartOpen, add,
    count: items.reduce((s, i) => s + i.quantity, 0),
    estimate: items.reduce((s, i) => s + i.quantity * Number(i.price || 0), 0),
    setQty: (i, q) => setItems((prev) => prev.map((x) => (key(x) === key(i) ? { ...x, quantity: Math.max(1, Math.min(q, x.max || 20, 20)) } : x))),
    remove: (i) => setItems((prev) => prev.filter((x) => key(x) !== key(i))),
    clear: () => setItems([]),
    wishlist,
    inWishlist: (id) => wishlist.includes(id),
    toggleWish: async (id) => {
      const on = wishlist.includes(id);
      setWishlist((w) => (on ? w.filter((x) => x !== id) : [...w, id]));
      if (user) {
        if (on) await supabase.from("wishlists").delete().eq("user_id", user.id).eq("product_id", id);
        else await supabase.from("wishlists").upsert({ user_id: user.id, product_id: id });
      }
      toast(on ? "Removed from wishlist" : "Saved to wishlist");
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useShop = () => useContext(Ctx);
