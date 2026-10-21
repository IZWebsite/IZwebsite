import { useState } from "react";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { DEFAULT_SECTIONS, SAMPLE_SECTION_TEXT, SAMPLE_PRODUCTS } from "../lib/defaults";
import { Spinner } from "../components/Bits";

const fill = (s) => {
  const d = { ...(DEFAULT_SECTIONS.find((x) => x.section_key === s.section_key) || {}), ...(SAMPLE_SECTION_TEXT[s.section_key] || {}) };
  const patch = {};
  ["title", "subtitle", "body", "cta_label", "cta_url", "image_url"].forEach((k) => { if (!s[k] && d[k]) patch[k] = d[k]; });
  return patch;
};

const ANCHOR = { marquee: "hero", features: "categories", tabs: "new_arrivals" };

// Moves sections added later (sort_order >= 100) next to their natural neighbour, then renumbers 1..n.
async function reorder() {
  const { data, error } = await supabase.from("homepage_content").select("id,section_key,sort_order").order("sort_order");
  if (error) throw error;
  const late = data.filter((s) => s.sort_order >= 100 && ANCHOR[s.section_key]);
  const out = data.filter((s) => !late.includes(s));
  late.forEach((s) => { const i = out.findIndex((x) => x.section_key === ANCHOR[s.section_key]); out.splice(i < 0 ? 1 : i + 1, 0, s); });
  for (const [i, s] of out.entries()) {
    if (s.sort_order !== i + 1) { const r = await supabase.from("homepage_content").update({ sort_order: i + 1 }).eq("id", s.id); if (r.error) throw r.error; }
  }
}

async function loadSample(sections, categories) {
  const missing = DEFAULT_SECTIONS.filter((d) => !sections.some((s) => s.section_key === d.section_key)).map((d) => ({ ...d, ...fill(d), sort_order: d.sort_order + 100 }));
  if (missing.length) { const { error } = await supabase.from("homepage_content").insert(missing); if (error) throw error; }
  for (const s of sections) {
    const patch = fill(s);
    if (Object.keys(patch).length || !s.is_visible) { const { error } = await supabase.from("homepage_content").update({ ...patch, is_visible: true }).eq("id", s.id); if (error) throw error; }
  }
  await reorder();
  const cat = (slug, n) => (categories.find((c) => c.slug === slug) || categories[n % Math.max(categories.length, 1)] || {}).id || null;
  const rows = SAMPLE_PRODUCTS.map(([name, sku, slug, price, sale, stock, img, flags], n) => ({
    name: `[SAMPLE] ${name}`, slug: `sample-${sku.toLowerCase()}`, sku, category_id: cat(slug, n), price, sale_price: sale, stock, status: "published",
    description: "Sample product so you can preview the homepage. Replace with your real photos, description, price and stock — or remove all samples in one tap.",
    material: "Brass alloy", finish: "Gold plated", care_instructions: "Keep away from water and perfume. Store in a pouch.",
    is_demo: true, tags: ["sample"], ...Object.fromEntries(flags.split(",").filter(Boolean).map((f) => [f, true])), _img: img,
  }));
  const { data: existing } = await supabase.from("products").select("sku").in("sku", rows.map((r) => r.sku));
  const fresh = rows.filter((r) => !(existing || []).some((e) => e.sku === r.sku));
  if (fresh.length) {
    const { data, error } = await supabase.from("products").insert(fresh.map(({ _img, ...r }) => r)).select("id,sku");
    if (error) throw error;
    const imgs = data.map((p) => { const r = fresh.find((x) => x.sku === p.sku); return { product_id: p.id, url: r._img, alt: r.name, sort_order: 0, is_primary: true }; });
    const res = await supabase.from("product_images").insert(imgs); if (res.error) throw res.error;
  }
}

export default function SampleContent() {
  const { sections, categories, reload } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm("Remove all [SAMPLE] products? Your own products are not touched.")) return;
    await run(async () => { const { error } = await supabase.from("products").delete().eq("is_demo", true); if (error) throw error; }, "Sample products removed");
  };
  return (
    <div className="bg-[color:var(--champagne)] p-5 flex flex-wrap items-center justify-between gap-4" data-testid="sample-content-card">
      <div className="max-w-2xl"><p className="font-display text-xl">Preview every homepage section</p><p className="text-sm">Adds all homepage sections with sample text and 8 [SAMPLE] products so nothing is hidden. Text you've already written is kept. Edit or hide sections below, and remove the samples whenever you like.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary h-11" disabled={busy} onClick={() => run(() => loadSample(sections, categories), "Sample content added — open your homepage to see every section")} data-testid="load-sample-content-btn">{busy ? <Spinner /> : "Load sample content"}</button>
        <button className="btn-outline h-11" disabled={busy} onClick={remove} data-testid="remove-sample-products-btn">Remove sample products</button>
      </div>
    </div>
  );
}
