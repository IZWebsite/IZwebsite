import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Star, Trash2, Download, Upload, Plus } from "lucide-react";
import { supabase, errMsg, uploadImage } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { inr, fmtDate, slugify, toCSV, parseCSV, download } from "../lib/format";
import { Field, Spinner } from "../components/Bits";
import { Card, PageTitle, confirmAction } from "./kit";

export function Products() {
  const { categories } = useStore();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ q: "", status: "", cat: "", sort: "created_at" });
  const [edits, setEdits] = useState({});
  const load = useCallback(() => {
    let q = supabase.from("catalog").select("*").order(f.sort, { ascending: f.sort === "available" || f.sort === "name" });
    if (f.status) q = q.eq("status", f.status);
    if (f.cat) q = q.eq("category_id", f.cat);
    if (f.q) { const s = f.q.replace(/[%,()]/g, " "); q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`); }
    q.limit(500).then(({ data }) => setRows(data || []));
  }, [f]);
  useEffect(() => { load(); }, [load]);
  const edit = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], id, [k]: v === "" ? null : Number(v) } }));
  const saveBulk = async () => {
    const list = Object.values(edits);
    const { error } = await supabase.rpc("admin_bulk_update", { p_updates: list });
    if (error) return toast.error(errMsg(error));
    toast.success(`${list.length} products updated`); setEdits({}); load();
  };
  const exportCsv = async () => {
    const { data } = await supabase.from("products").select("sku,name,slug,price,sale_price,stock,status,description,material,finish,colour,is_anti_tarnish,is_featured,is_new,categories(slug)");
    download("products.csv", toCSV((data || []).map(({ categories: c, ...p }) => ({ ...p, category_slug: c?.slug || "" }))));
  };
  const importCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const recs = parseCSV(await file.text());
    const catBy = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
    const bad = recs.filter((r) => !r.sku || !r.name || isNaN(Number(r.price)));
    if (bad.length) { toast.error(`${bad.length} rows are missing sku, name or price`); e.target.value = ""; return; }
    const rows = recs.map((r) => ({
      sku: r.sku.trim(), name: r.name.trim(), slug: r.slug?.trim() || slugify(`${r.name}-${r.sku}`), price: Number(r.price),
      sale_price: r.sale_price ? Number(r.sale_price) : null, stock: Number(r.stock || 0), status: ["draft", "published", "archived"].includes(r.status) ? r.status : "draft",
      description: r.description || null, material: r.material || null, finish: r.finish || null, colour: r.colour || null,
      is_anti_tarnish: r.is_anti_tarnish === "true", is_featured: r.is_featured === "true", is_new: r.is_new === "true", category_id: catBy[r.category_slug] || null,
    }));
    const { error } = await supabase.from("products").upsert(rows, { onConflict: "sku" });
    e.target.value = "";
    if (error) return toast.error(errMsg(error));
    toast.success(`Imported ${rows.length} products`); load();
  };
  const n = Object.keys(edits).length;
  return (
    <div data-testid="admin-products">
      <PageTitle title="Products">
        <button className="btn-outline h-10" onClick={exportCsv} data-testid="products-export-btn"><Download size={15} />CSV</button>
        <label className="btn-outline h-10 cursor-pointer"><Upload size={15} />Import<input type="file" accept=".csv" className="hidden" onChange={importCsv} data-testid="products-import-input" /></label>
        <Link to="/admin/products/new" className="btn-primary h-10" data-testid="add-product-btn"><Plus size={15} />Add product</Link>
      </PageTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <input className="input col-span-2 md:col-span-1" placeholder="Search name or SKU" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="products-search-input" />
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} data-testid="products-status-filter"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
        <select className="input" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="created_at">Newest</option><option value="name">Name</option><option value="available">Lowest stock</option><option value="sold_count">Best selling</option></select>
      </div>
      {n > 0 && <div className="sticky top-28 lg:top-2 z-20 bg-[color:var(--champagne)] p-3 mb-3 flex items-center justify-between"><span className="text-sm">{n} unsaved change(s)</span><div className="flex gap-2"><button className="btn-ghost h-9" onClick={() => setEdits({})}>Discard</button><button className="btn-primary h-9" onClick={saveBulk} data-testid="bulk-save-btn">Save all</button></div></div>}
      {!rows ? <Spinner /> : (
        <div className="bg-card border divide-y">
          <div className="hidden md:grid grid-cols-[56px_1fr_110px_110px_90px_90px] gap-3 p-3 text-[11px] uppercase tracking-wider text-muted-foreground"><span /><span>Product</span><span>Price ₹</span><span>Sale ₹</span><span>Stock</span><span>Available</span></div>
          {rows.map((p) => (
            <div key={p.id} className="grid grid-cols-[56px_1fr] md:grid-cols-[56px_1fr_110px_110px_90px_90px] gap-3 p-3 items-center" data-testid={`admin-product-row-${p.sku}`}>
              <img src={p.image_url || "/demo/set.jpg"} alt="" className="w-14 h-14 object-cover" />
              <Link to={`/admin/products/${p.id}`} className="min-w-0"><p className="text-sm truncate">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku} · <span className={p.status === "published" ? "text-emerald-700" : ""}>{p.status}</span>{p.variant_count > 0 && ` · ${p.variant_count} variants`}</p></Link>
              <div className="col-span-2 md:col-span-4 grid grid-cols-4 gap-2 md:contents">
                <input className="input h-9" type="number" min="0" defaultValue={p.price} onChange={(e) => edit(p.id, "price", e.target.value)} aria-label="Price" />
                <input className="input h-9" type="number" min="0" defaultValue={p.sale_price ?? ""} placeholder="—" onChange={(e) => (e.target.value === "" ? setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], id: p.id, clear_sale: true } })) : edit(p.id, "sale_price", e.target.value))} aria-label="Sale price" />
                {p.variant_count > 0 ? <span className="text-xs text-muted-foreground self-center">per variant</span> : <input className="input h-9" type="number" min="0" defaultValue={p.available + 0} key={`${p.id}-${p.available}`} onChange={(e) => edit(p.id, "stock", Number(e.target.value) + (p.reserved || 0))} aria-label="Stock" data-testid={`stock-input-${p.sku}`} />}
                <span className={`text-sm self-center ${p.available <= 0 ? "text-red-700" : p.available <= p.low_stock_threshold ? "text-amber-700" : ""}`}>{p.available <= 0 ? "Sold out" : p.available}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-3">Stock column edits the available quantity; units held for unpaid online checkouts are kept separately.</p>
    </div>
  );
}

const EMPTY = { name: "", slug: "", sku: "", category_id: "", description: "", price: "", sale_price: "", stock: 0, low_stock_threshold: 3, status: "draft", material: "", finish: "", colour: "", size: "", dimensions: "", weight: "", care_instructions: "", is_anti_tarnish: false, anti_tarnish_info: "", is_featured: false, is_new: true, is_bestseller: false, is_trending: false, is_festive: false, tags: [], seo_title: "", seo_description: "" };

function Images({ productId, name }) {
  const [imgs, setImgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => supabase.from("product_images").select("*").eq("product_id", productId).order("sort_order").then(({ data }) => setImgs(data || [])), [productId]);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    const files = [...(e.target.files || [])]; setBusy(true);
    for (const [i, f] of files.entries()) {
      try { const url = await uploadImage(f, "products"); await supabase.from("product_images").insert({ product_id: productId, url, alt: name, sort_order: imgs.length + i, is_primary: imgs.length === 0 && i === 0 }); }
      catch (err) { toast.error(`${f.name}: ${errMsg(err)}`); }
    }
    setBusy(false); e.target.value = ""; load();
  };
  const move = async (i, d) => {
    const a = imgs[i], b = imgs[i + d]; if (!b) return;
    await Promise.all([supabase.from("product_images").update({ sort_order: i + d }).eq("id", a.id), supabase.from("product_images").update({ sort_order: i }).eq("id", b.id)]); load();
  };
  const primary = async (id) => { await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId); await supabase.from("product_images").update({ is_primary: true }).eq("id", id); load(); };
  const del = async (id) => { if (confirmAction("Delete this photo?")) { await supabase.from("product_images").delete().eq("id", id); load(); } };
  const alt = async (id, v) => supabase.from("product_images").update({ alt: v }).eq("id", id);
  return (
    <Card title="Photos" action={<label className="btn-outline h-10 cursor-pointer">{busy ? <Spinner /> : "Upload photos"}<input type="file" multiple accept="image/*" className="hidden" onChange={add} data-testid="product-images-input" /></label>}>
      <p className="text-xs text-muted-foreground -mt-3 mb-4">JPG/PNG/WebP up to 10 MB — automatically resized to 1600px and converted to WebP.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{imgs.map((im, i) => (
        <div key={im.id} className="border" data-testid="product-image-item">
          <div className="relative"><img src={im.url} alt={im.alt || ""} className="w-full aspect-square object-cover" />{im.is_primary && <span className="chip absolute top-1 left-1">Primary</span>}</div>
          <input className="input h-8 text-xs border-0 border-t" defaultValue={im.alt || ""} placeholder="Alt text" onBlur={(e) => alt(im.id, e.target.value)} />
          <div className="flex justify-between p-1"><button onClick={() => move(i, -1)} aria-label="Move left" className="p-1.5"><ArrowUp size={14} className="-rotate-90" /></button><button onClick={() => move(i, 1)} aria-label="Move right" className="p-1.5"><ArrowDown size={14} className="-rotate-90" /></button><button onClick={() => primary(im.id)} aria-label="Set primary" className="p-1.5"><Star size={14} /></button><button onClick={() => del(im.id)} aria-label="Delete" className="p-1.5 text-red-700"><Trash2 size={14} /></button></div>
        </div>
      ))}</div>
    </Card>
  );
}

function Variants({ productId, sku }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => supabase.from("product_variants").select("*").eq("product_id", productId).order("sort_order").then(({ data }) => setRows(data || [])), [productId]);
  useEffect(() => { load(); }, [load]);
  const save = async (v) => {
    const row = { name: v.name, sku: v.sku, price: v.price === "" || v.price == null ? null : Number(v.price), sale_price: v.sale_price === "" || v.sale_price == null ? null : Number(v.sale_price), stock: Number(v.stock || 0), is_active: v.is_active, sort_order: v.sort_order };
    const { error } = v.id ? await supabase.from("product_variants").update(row).eq("id", v.id) : await supabase.from("product_variants").insert({ ...row, product_id: productId });
    if (error) return toast.error(errMsg(error)); toast.success("Variant saved"); load();
  };
  const del = async (id) => { if (confirmAction("Delete this variant?")) { const { error } = await supabase.from("product_variants").delete().eq("id", id); if (error) toast.error(errMsg(error)); load(); } };
  const upd = (i, k, v) => setRows((r) => r.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Variants (size / colour / design)" action={<button className="btn-outline h-10" onClick={() => setRows([...rows, { name: "", sku: `${sku}-${rows.length + 1}`, price: "", sale_price: "", stock: 0, is_active: true, sort_order: rows.length }])} data-testid="add-variant-btn">Add variant</button>}>
      <p className="text-xs text-muted-foreground -mt-3 mb-4">When variants exist, stock is tracked per variant. Leave price empty to use the product price.</p>
      {rows.map((v, i) => (
        <div key={v.id || i} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_90px_90px_80px_auto] gap-2 py-2 border-b items-center" data-testid="variant-row">
          <input className="input h-9" placeholder="Name e.g. Size 7" value={v.name} onChange={(e) => upd(i, "name", e.target.value)} />
          <input className="input h-9" placeholder="SKU" value={v.sku} onChange={(e) => upd(i, "sku", e.target.value)} />
          <input className="input h-9" type="number" placeholder="Price" value={v.price ?? ""} onChange={(e) => upd(i, "price", e.target.value)} />
          <input className="input h-9" type="number" placeholder="Sale" value={v.sale_price ?? ""} onChange={(e) => upd(i, "sale_price", e.target.value)} />
          <input className="input h-9" type="number" min={v.reserved || 0} placeholder="Stock" value={v.stock} onChange={(e) => upd(i, "stock", e.target.value)} />
          <div className="flex gap-2 items-center"><label className="text-xs flex gap-1"><input type="checkbox" checked={v.is_active} onChange={(e) => upd(i, "is_active", e.target.checked)} />Active</label><button className="btn-primary h-9 px-3" onClick={() => save(v)}>Save</button>{v.id && <button onClick={() => del(v.id)} className="text-red-700 p-1" aria-label="Delete variant"><Trash2 size={14} /></button>}</div>
        </div>
      ))}
    </Card>
  );
}

function Movements({ productId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { supabase.from("inventory_movements").select("*, product_variants(name)").eq("product_id", productId).order("created_at", { ascending: false }).limit(30).then(({ data }) => setRows(data || [])); }, [productId]);
  return <Card title="Stock movement history">{rows.length ? rows.map((m) => <p key={m.id} className="text-sm py-1 border-b last:border-0 flex justify-between gap-3"><span><span className={m.change > 0 ? "text-emerald-700" : "text-red-700"}>{m.change > 0 ? "+" : ""}{m.change}</span> {m.product_variants?.name && `(${m.product_variants.name})`} · {m.reason.replace(/_/g, " ")} {m.reference && `· ${m.reference}`}</span><span className="text-muted-foreground text-xs whitespace-nowrap">→ {m.stock_after} · {fmtDate(m.created_at, true)}</span></p>) : <p className="text-sm text-muted-foreground">No movements yet.</p>}</Card>;
}

export function ProductEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { categories } = useStore();
  const [p, setP] = useState(id === "new" ? EMPTY : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (id !== "new") supabase.from("products").select("*").eq("id", id).single().then(({ data }) => setP(data)); }, [id]);
  if (!p) return <Spinner />;
  const up = (k) => (e) => setP({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (statusOverride) => {
    setBusy(true);
    const { id: _id, created_at, updated_at, view_count, sold_count, reserved, ...rest } = p;
    const row = { ...rest, status: statusOverride || p.status, slug: p.slug || slugify(p.name), category_id: p.category_id || null, price: Number(p.price), sale_price: p.sale_price === "" || p.sale_price == null ? null : Number(p.sale_price), stock: Number(p.stock || 0), low_stock_threshold: Number(p.low_stock_threshold || 0), tags: typeof p.tags === "string" ? p.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : p.tags };
    if (!row.name || !row.sku || isNaN(row.price)) { setBusy(false); return toast.error("Name, SKU and price are required"); }
    const { data, error } = id === "new" ? await supabase.from("products").insert(row).select().single() : await supabase.from("products").update(row).eq("id", id).select().single();
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "SKU or URL slug already exists" : errMsg(error));
    toast.success(statusOverride ? `Product ${statusOverride}` : "Saved");
    if (id === "new") nav(`/admin/products/${data.id}`, { replace: true }); else setP(data);
  };
  const del = async () => {
    if (!confirmAction("Delete this product permanently? Past orders keep their item snapshots. Consider archiving instead.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(errMsg(error)); toast.success("Deleted"); nav("/admin/products");
  };
  const T = (k, l, type = "text") => <Field label={l}><input className="input" type={type} value={p[k] ?? ""} onChange={up(k)} data-testid={`product-${k}-input`} /></Field>;
  return (
    <div className="space-y-6" data-testid="admin-product-edit">
      <Link to="/admin/products" className="text-xs link-u">← All products</Link>
      <PageTitle title={id === "new" ? "New product" : p.name}>
        {id !== "new" && <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-10" data-testid="product-preview-link">Preview</a>}
        <button className="btn-outline h-10" disabled={busy} onClick={() => save()} data-testid="product-save-btn">Save</button>
        {p.status !== "published" ? <button className="btn-primary h-10" disabled={busy} onClick={() => save("published")} data-testid="product-publish-btn">Publish</button> : <button className="btn-outline h-10" disabled={busy} onClick={() => save("draft")} data-testid="product-unpublish-btn">Unpublish</button>}
      </PageTitle>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          <Card title="Basics"><div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">{T("name", "Product name")}</div>{T("sku", "SKU")}
            <Field label="URL slug"><input className="input" value={p.slug} placeholder={slugify(p.name || "")} onChange={(e) => setP({ ...p, slug: slugify(e.target.value) })} data-testid="product-slug-input" /></Field>
            <Field label="Category"><select className="input" value={p.category_id || ""} onChange={up("category_id")} data-testid="product-category-select"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>)}</select></Field>
            <Field label="Tags (comma separated)"><input className="input" value={Array.isArray(p.tags) ? p.tags.join(", ") : p.tags} onChange={up("tags")} /></Field>
            <div className="sm:col-span-2"><Field label="Description"><textarea className="input h-32 py-2" value={p.description || ""} onChange={up("description")} data-testid="product-description-input" /></Field></div>
          </div></Card>
          <Card title="Details"><div className="grid sm:grid-cols-3 gap-4">{T("material", "Material")}{T("finish", "Finish")}{T("colour", "Colour")}{T("size", "Size")}{T("dimensions", "Dimensions")}{T("weight", "Weight")}
            <div className="sm:col-span-3"><Field label="Care instructions"><textarea className="input h-20 py-2" value={p.care_instructions || ""} onChange={up("care_instructions")} /></Field></div>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.is_anti_tarnish} onChange={up("is_anti_tarnish")} />Anti-tarnish</label>
            {p.is_anti_tarnish && <div className="sm:col-span-2"><Field label="Anti-tarnish details (only accurate claims)"><input className="input" value={p.anti_tarnish_info || ""} onChange={up("anti_tarnish_info")} /></Field></div>}
          </div></Card>
          {id !== "new" ? <><Images productId={id} name={p.name} /><Variants productId={id} sku={p.sku} /><Movements productId={id} /></> : <p className="text-sm text-muted-foreground">Save the product first to add photos and variants.</p>}
        </div>
        <div className="space-y-6">
          <Card title="Price & stock"><div className="space-y-4">{T("price", "Price (₹)", "number")}{T("sale_price", "Sale price (₹, optional)", "number")}{T("stock", "Stock quantity", "number")}{T("low_stock_threshold", "Low-stock alert at", "number")}{id !== "new" && p.reserved > 0 && <p className="text-xs text-amber-700">{p.reserved} units held for unpaid checkouts</p>}</div></Card>
          <Card title="Visibility"><div className="space-y-2 text-sm">
            <Field label="Status"><select className="input" value={p.status} onChange={up("status")} data-testid="product-status-select"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
            {[["is_featured", "Featured"], ["is_new", "New arrival"], ["is_bestseller", "Bestseller"], ["is_trending", "Trending"], ["is_festive", "Festive collection"]].map(([k, l]) => <label key={k} className="flex gap-2"><input type="checkbox" checked={!!p[k]} onChange={up(k)} data-testid={`product-${k}-checkbox`} />{l}</label>)}
          </div></Card>
          <Card title="SEO"><div className="space-y-3">{T("seo_title", "SEO title")}<Field label="SEO description"><textarea className="input h-20 py-2" maxLength={160} value={p.seo_description || ""} onChange={up("seo_description")} /></Field></div></Card>
          {id !== "new" && <button className="btn-outline w-full border-red-700 text-red-700 hover:bg-red-700" onClick={del} data-testid="product-delete-btn">Delete product</button>}
          {id !== "new" && <p className="text-xs text-muted-foreground">Sold {p.sold_count} · Viewed {p.view_count} · Price {inr(p.sale_price ?? p.price)}</p>}
        </div>
      </div>
    </div>
  );
}
