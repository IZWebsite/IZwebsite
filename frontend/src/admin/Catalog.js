import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useAuth, can } from "../context/AuthContext";
import { slugify, fmtDate, inr } from "../lib/format";
import { Field } from "../components/Bits";
import { Card, PageTitle, ImageInput, confirmAction } from "./kit";

function Categories() {
  const { categories, reload } = useStore();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const add = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("categories").insert({ name, slug: slugify(name), parent_id: parent || null, sort_order: categories.length + 1 });
    if (error) return toast.error(error.code === "23505" ? "A category with this name exists" : errMsg(error));
    setName(""); reload();
  };
  const upd = async (id, patch) => { const { error } = await supabase.from("categories").update(patch).eq("id", id); if (error) toast.error(errMsg(error)); reload(); };
  const move = async (i, d) => { const a = categories[i], b = categories[i + d]; if (!b) return; await upd(a.id, { sort_order: b.sort_order }); await upd(b.id, { sort_order: a.sort_order }); };
  const del = async (c) => {
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", c.id);
    if (!confirmAction(`Delete "${c.name}"? ${count || 0} product(s) will become uncategorised (not deleted).`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id); if (error) toast.error(errMsg(error)); reload();
  };
  return (
    <Card title="Categories">
      <form onSubmit={add} className="flex flex-wrap gap-2 mb-5"><input required className="input flex-1 min-w-[160px]" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} data-testid="category-name-input" /><select className="input w-auto" value={parent} onChange={(e) => setParent(e.target.value)}><option value="">Top level</option>{categories.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>Under {c.name}</option>)}</select><button className="btn-primary h-11" data-testid="category-add-btn">Add</button></form>
      <div className="divide-y">{categories.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2 py-2" data-testid={`category-row-${c.slug}`}>
          <ImageInput folder="categories" value={c.image_url} onChange={(url) => upd(c.id, { image_url: url || null })} />
          <input className="input h-9 flex-1" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && upd(c.id, { name: e.target.value })} aria-label="Rename" />
          <label className="text-xs flex gap-1 whitespace-nowrap"><input type="checkbox" checked={c.is_featured} onChange={(e) => upd(c.id, { is_featured: e.target.checked })} />Home</label>
          <button onClick={() => move(i, -1)} className="p-1.5" aria-label="Up"><ArrowUp size={14} /></button><button onClick={() => move(i, 1)} className="p-1.5" aria-label="Down"><ArrowDown size={14} /></button>
          <button onClick={() => upd(c.id, { is_visible: !c.is_visible })} className="p-1.5" aria-label="Toggle visibility">{c.is_visible ? <Eye size={14} /> : <EyeOff size={14} className="text-muted-foreground" />}</button>
          <button onClick={() => del(c)} className="p-1.5 text-red-700" aria-label="Delete"><Trash2 size={14} /></button>
        </div>
      ))}</div>
    </Card>
  );
}

const NEWC = { code: "", description: "", discount_type: "percent", value: 10, min_cart_value: 0, max_discount: "", starts_at: "", expires_at: "", usage_limit: "", per_customer_limit: 1, category_ids: [], product_ids: [], is_active: true };
function Coupons() {
  const { categories } = useStore();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null);
  const [products, setProducts] = useState([]);
  const load = useCallback(() => supabase.from("coupons").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || [])), []);
  useEffect(() => { load(); supabase.from("products").select("id,name").order("name").then(({ data }) => setProducts(data || [])); }, [load]);
  const save = async (e) => {
    e.preventDefault();
    const n = (v) => (v === "" || v == null ? null : Number(v));
    const row = { ...f, code: f.code.trim().toUpperCase(), value: Number(f.value), min_cart_value: Number(f.min_cart_value || 0), max_discount: n(f.max_discount), usage_limit: n(f.usage_limit), per_customer_limit: n(f.per_customer_limit), starts_at: f.starts_at || null, expires_at: f.expires_at || null };
    delete row.id; delete row.created_at; delete row.used_count;
    const { error } = f.id ? await supabase.from("coupons").update(row).eq("id", f.id) : await supabase.from("coupons").insert(row);
    if (error) return toast.error(error.code === "23505" ? "Code already exists" : errMsg(error));
    toast.success("Coupon saved"); setF(null); load();
  };
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const multi = (k) => (e) => setF({ ...f, [k]: [...e.target.selectedOptions].map((o) => o.value) });
  return (
    <Card title="Coupons & offers" action={<button className="btn-outline h-10" onClick={() => setF(NEWC)} data-testid="add-coupon-btn">New coupon</button>}>
      {f && (
        <form onSubmit={save} className="grid sm:grid-cols-3 gap-3 mb-6 p-4 bg-secondary/50" data-testid="coupon-form">
          <Field label="Code"><input required className="input uppercase" value={f.code} onChange={up("code")} data-testid="coupon-code-input" /></Field>
          <Field label="Type"><select className="input" value={f.discount_type} onChange={up("discount_type")} data-testid="coupon-type-select"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option><option value="free_shipping">Free shipping</option></select></Field>
          <Field label={f.discount_type === "percent" ? "Percent off" : "Amount off (₹)"}><input className="input" type="number" min="0" value={f.value} onChange={up("value")} data-testid="coupon-value-input" /></Field>
          <Field label="Minimum cart (₹)"><input className="input" type="number" value={f.min_cart_value} onChange={up("min_cart_value")} /></Field>
          <Field label="Max discount (₹)"><input className="input" type="number" value={f.max_discount ?? ""} onChange={up("max_discount")} /></Field>
          <Field label="Total uses limit"><input className="input" type="number" value={f.usage_limit ?? ""} onChange={up("usage_limit")} /></Field>
          <Field label="Uses per customer"><input className="input" type="number" value={f.per_customer_limit ?? ""} onChange={up("per_customer_limit")} /></Field>
          <Field label="Starts"><input className="input" type="datetime-local" value={(f.starts_at || "").slice(0, 16)} onChange={up("starts_at")} /></Field>
          <Field label="Expires"><input className="input" type="datetime-local" value={(f.expires_at || "").slice(0, 16)} onChange={up("expires_at")} /></Field>
          <Field label="Only categories (optional)"><select multiple className="input h-24" value={f.category_ids} onChange={multi("category_ids")}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Only products (optional)"><select multiple className="input h-24" value={f.product_ids} onChange={multi("product_ids")}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Description"><input className="input" value={f.description || ""} onChange={up("description")} /></Field>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={up("is_active")} />Active</label>
          <div className="sm:col-span-3 flex gap-2"><button className="btn-primary h-10" data-testid="coupon-save-btn">Save coupon</button><button type="button" className="btn-ghost h-10" onClick={() => setF(null)}>Cancel</button></div>
        </form>
      )}
      <div className="divide-y">{rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" data-testid={`coupon-row-${c.code}`}>
          <div><p className="font-medium">{c.code} {!c.is_active && <span className="chip ml-1">Inactive</span>}</p><p className="text-xs text-muted-foreground">{c.discount_type === "percent" ? `${c.value}% off` : c.discount_type === "fixed" ? `${inr(c.value)} off` : "Free shipping"}{Number(c.min_cart_value) > 0 && ` · min ${inr(c.min_cart_value)}`} · used {c.used_count}{c.usage_limit && `/${c.usage_limit}`}{c.expires_at && ` · until ${fmtDate(c.expires_at)}`}</p></div>
          <div className="flex gap-3"><button className="link-u" onClick={() => setF(c)}>Edit</button><button className="link-u" onClick={async () => { await supabase.from("coupons").update({ is_active: !c.is_active }).eq("id", c.id); load(); }}>{c.is_active ? "Deactivate" : "Activate"}</button></div>
        </div>
      ))}</div>
      <p className="text-xs text-muted-foreground mt-4">Discounts are always validated and calculated on the server at checkout. Free-shipping threshold lives in Settings → Shipping.</p>
    </Card>
  );
}

function Reviews() {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => supabase.from("product_reviews").select("*, products(name)").order("created_at", { ascending: false }).limit(50).then(({ data }) => setRows(data || [])), []);
  useEffect(() => { load(); }, [load]);
  const set = async (id, status) => { await supabase.from("product_reviews").update({ status }).eq("id", id); load(); };
  return (
    <Card title="Review moderation">{rows.length ? rows.map((r) => (
      <div key={r.id} className="py-3 border-b last:border-0 text-sm" data-testid="review-mod-row"><p><span className="font-medium">{r.products?.name}</span> · {r.rating}★ · {r.author_name}{r.is_verified && " · verified"} · <span className="text-muted-foreground">{r.status}</span></p><p className="text-muted-foreground">{r.title} {r.body}</p>
        <div className="flex gap-3 mt-1"><button className="link-u text-emerald-700" onClick={() => set(r.id, "approved")}>Approve</button><button className="link-u text-red-700" onClick={() => set(r.id, "rejected")}>Reject</button></div></div>
    )) : <p className="text-sm text-muted-foreground">No reviews yet. Only genuine customer reviews appear here.</p>}</Card>
  );
}

export default function Catalog() {
  const { role } = useAuth();
  return (
    <div className="space-y-6" data-testid="admin-catalog">
      <PageTitle title="Categories & offers" />
      <Categories />
      {can(role, "coupons") && <Coupons />}
      {can(role, "content") && <Reviews />}
    </div>
  );
}
