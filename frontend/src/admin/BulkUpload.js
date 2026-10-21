import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, X } from "lucide-react";
import { readSheet } from "read-excel-file/universal";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { slugify, toCSV, parseCSV, download } from "../lib/format";
import { Spinner } from "../components/Bits";
import { Card } from "./kit";

const COLS = ["sku", "name", "category", "price", "sale_price", "stock", "status", "description", "material", "finish", "colour", "image_urls", "is_anti_tarnish", "is_featured", "is_new", "is_bestseller", "is_trending", "is_festive", "tags"];
const FLAGS = ["is_anti_tarnish", "is_featured", "is_new", "is_bestseller", "is_trending", "is_festive"];
const yes = (v) => ["yes", "y", "true", "1"].includes(String(v ?? "").trim().toLowerCase());
const str = (v) => (v == null ? "" : String(v).trim());

const template = () => download("iminationz-products-template.csv", toCSV([{
  sku: "IMZ-ER-001", name: "Gold Hoop Earrings", category: "Earrings", price: 799, sale_price: 649, stock: 10, status: "published",
  description: "Lightweight gold-plated hoops for everyday wear.", material: "Brass alloy", finish: "Gold plated", colour: "Gold",
  image_urls: "https://example.com/hoop-1.jpg | https://example.com/hoop-2.jpg", is_anti_tarnish: "yes", is_featured: "no", is_new: "yes",
  is_bestseller: "no", is_trending: "yes", is_festive: "no", tags: "hoops, daily wear",
}]));

async function readFile(file) {
  if (!/\.xlsx$/i.test(file.name)) return parseCSV(await file.text()).filter((r) => COLS.some((c) => str(r[c])));
  const grid = await readSheet(await file.arrayBuffer());
  const head = grid[0].map((h) => str(h).toLowerCase());
  return grid.slice(1).filter((r) => r.some((c) => str(c))).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function check(recs, categories) {
  const find = (v) => { const s = str(v).toLowerCase(); return categories.find((c) => c.slug === s || c.name.toLowerCase() === s || c.slug === slugify(s)); };
  const seen = new Set();
  return recs.map((r, i) => {
    const errs = []; const sku = str(r.sku); const name = str(r.name);
    const price = Number(r.price); const sale = str(r.sale_price) === "" ? null : Number(r.sale_price); const stock = str(r.stock) === "" ? 0 : Number(r.stock);
    if (!sku) errs.push("SKU missing"); else if (seen.has(sku)) errs.push("Duplicate SKU"); seen.add(sku);
    if (!name) errs.push("Name missing");
    if (str(r.price) === "" || isNaN(price) || price < 0) errs.push("Price invalid");
    if (sale != null && (isNaN(sale) || sale < 0 || sale > price)) errs.push("Sale price must be below price");
    if (!Number.isInteger(stock) || stock < 0) errs.push("Stock must be a whole number");
    const cat = str(r.category || r.category_slug) ? find(r.category || r.category_slug) : null;
    const warn = str(r.category || r.category_slug) && !cat ? "Category not found — saved without category" : "";
    const status = ["draft", "published", "archived"].includes(str(r.status).toLowerCase()) ? str(r.status).toLowerCase() : "draft";
    const row = {
      sku, name, price, sale_price: sale, stock, status, category_id: cat?.id || null,
      description: str(r.description) || null, material: str(r.material) || null, finish: str(r.finish) || null, colour: str(r.colour) || null,
      tags: str(r.tags) ? str(r.tags).split(",").map((t) => t.trim()).filter(Boolean) : [],
      ...Object.fromEntries(FLAGS.map((f) => [f, yes(r[f])])),
    };
    return { n: i + 2, row, errs, warn, cat: cat?.name || "", images: str(r.image_urls).split(/[|\n]/).map((u) => u.trim()).filter((u) => /^https?:\/\/|^\//.test(u)) };
  });
}

async function save(items) {
  const skus = items.map((x) => x.row.sku);
  const { data: ex, error: e0 } = await supabase.from("products").select("sku").in("sku", skus); if (e0) throw e0;
  const exists = new Set((ex || []).map((x) => x.sku));
  const fresh = items.filter((x) => !exists.has(x.row.sku)).map((x) => ({ ...x.row, slug: slugify(`${x.row.name}-${x.row.sku}`) }));
  const old = items.filter((x) => exists.has(x.row.sku)).map((x) => x.row);
  const ids = [];
  for (const [list, fn] of [[fresh, (c) => supabase.from("products").insert(c)], [old, (c) => supabase.from("products").upsert(c, { onConflict: "sku" })]]) {
    for (let i = 0; i < list.length; i += 200) { const { data, error } = await fn(list.slice(i, i + 200)).select("id,sku"); if (error) throw error; ids.push(...data); }
  }
  const withImg = items.filter((x) => x.images.length);
  if (withImg.length) {
    const pid = Object.fromEntries(ids.map((p) => [p.sku, p.id]));
    const { data: cur } = await supabase.from("product_images").select("product_id,url").in("product_id", withImg.map((x) => pid[x.row.sku]));
    const add = withImg.flatMap((x) => {
      const mine = (cur || []).filter((c) => c.product_id === pid[x.row.sku]);
      return x.images.filter((u) => !mine.some((c) => c.url === u)).map((url, k) => ({ product_id: pid[x.row.sku], url, alt: x.row.name, sort_order: mine.length + k, is_primary: !mine.length && k === 0 }));
    });
    if (add.length) { const { error } = await supabase.from("product_images").insert(add); if (error) throw error; }
  }
  return { added: fresh.length, updated: old.length };
}

export default function BulkUpload({ onClose, onDone }) {
  const { categories } = useStore();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try { const recs = await readFile(file); if (!recs.length) return toast.error("No product rows found in this file"); setItems(check(recs, categories)); }
    catch { toast.error("Couldn't read this file. Use the template and save as .xlsx or .csv"); }
  };
  const bad = (items || []).filter((x) => x.errs.length);
  const go = async () => {
    setBusy(true);
    try { const r = await save(items); toast.success(`${r.added} products added, ${r.updated} updated`); setItems(null); onDone(); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <Card title="Bulk upload products" action={<button onClick={onClose} className="p-2" aria-label="Close bulk upload" data-testid="bulk-close-btn"><X size={16} /></button>}>
      <div data-testid="bulk-upload-card">
        <ol className="text-sm space-y-1.5 list-decimal pl-5 -mt-2 mb-4 text-muted-foreground">
          <li>Download the template and fill one product per row in Excel or Google Sheets.</li>
          <li>Category = your category name (e.g. Earrings). Photos = image links separated by |. Yes/No for the tick boxes.</li>
          <li>Rows with an existing SKU update that product; new SKUs are added. Status blank = draft (hidden).</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline h-10" onClick={template} data-testid="bulk-template-btn">Download template</button>
          <label className="btn-primary h-10 cursor-pointer"><FileSpreadsheet size={15} />Choose .xlsx or .csv<input type="file" accept=".csv,.xlsx" className="hidden" onChange={pick} data-testid="bulk-file-input" /></label>
        </div>
        {items && <Preview items={items} bad={bad} busy={busy} go={go} />}
      </div>
    </Card>
  );
}

function Preview({ items, bad, busy, go }) {
  return (
    <div className="mt-5" data-testid="bulk-preview">
      <p className="text-sm mb-2" data-testid="bulk-summary">{items.length} rows · <span className={bad.length ? "text-red-700" : "text-green-700"}>{bad.length ? `${bad.length} need fixing` : "all ready"}</span></p>
      <div className="overflow-x-auto max-h-80 border"><table className="w-full text-xs">
        <thead className="bg-secondary sticky top-0"><tr>{["Row", "SKU", "Name", "Category", "Price", "Sale", "Stock", "Photos", "Status"].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{items.map((x) => (
          <tr key={x.n} className={`border-t ${x.errs.length ? "bg-red-50" : ""}`} data-testid={`bulk-row-${x.n}`}>
            <td className="p-2">{x.n}</td><td className="p-2">{x.row.sku}</td><td className="p-2">{x.row.name}</td><td className="p-2">{x.cat || "—"}</td>
            <td className="p-2">{x.row.price}</td><td className="p-2">{x.row.sale_price ?? ""}</td><td className="p-2">{x.row.stock}</td><td className="p-2">{x.images.length}</td>
            <td className="p-2">{x.errs.length ? <span className="text-red-700">{x.errs.join(", ")}</span> : x.warn ? <span className="text-amber-700">{x.warn}</span> : x.row.status}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="btn-primary h-11 mt-4" disabled={busy || bad.length > 0} onClick={go} data-testid="bulk-import-btn">{busy ? <Spinner /> : `Import ${items.length} products`}</button>
      {bad.length > 0 && <p className="text-xs text-red-700 mt-2">Fix the highlighted rows in your sheet and choose the file again.</p>}
    </div>
  );
}
