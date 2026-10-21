import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useAuth, can } from "../context/AuthContext";
import { Field } from "../components/Bits";
import { Card, PageTitle, ImageInput, SettingForm, confirmAction } from "./kit";

function Sections() {
  const { sections, reload } = useStore();
  const [open, setOpen] = useState(null);
  const upd = async (id, patch) => { const { error } = await supabase.from("homepage_content").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id); if (error) toast.error(errMsg(error)); reload(); };
  const move = async (i, d) => { const a = sections[i], b = sections[i + d]; if (!b) return; await upd(a.id, { sort_order: b.sort_order }); await upd(b.id, { sort_order: a.sort_order }); };
  return (
    <Card title="Homepage sections">
      <p className="text-xs text-muted-foreground -mt-3 mb-4">Reorder, hide or edit each section. Changes go live immediately.</p>
      <div className="divide-y">{sections.map((s, i) => (
        <div key={s.id} className="py-2" data-testid={`section-row-${s.section_key}`}>
          <div className="flex items-center gap-2">
            <button className="flex-1 text-left text-sm" onClick={() => setOpen(open === s.id ? null : s.id)}><span className={s.is_visible ? "" : "text-muted-foreground line-through"}>{s.label}</span>{s.title && <span className="text-xs text-muted-foreground"> · {s.title}</span>}</button>
            <button onClick={() => move(i, -1)} className="p-2" aria-label="Move up" data-testid={`section-up-${s.section_key}`}><ArrowUp size={14} /></button>
            <button onClick={() => move(i, 1)} className="p-2" aria-label="Move down"><ArrowDown size={14} /></button>
            <button onClick={() => upd(s.id, { is_visible: !s.is_visible })} className="p-2" aria-label="Toggle" data-testid={`section-toggle-${s.section_key}`}>{s.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          </div>
          {open === s.id && <SectionForm s={s} onSave={(p) => upd(s.id, p).then(() => toast.success("Section published"))} />}
        </div>
      ))}</div>
    </Card>
  );
}

function SectionForm({ s, onSave }) {
  const [f, setF] = useState(s);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (["hero", "promo"].includes(s.section_key)) return <p className="text-xs text-muted-foreground p-3">Edit these in "Banners" below.</p>;
  return (
    <div className="grid sm:grid-cols-2 gap-3 p-3 bg-secondary/50 mt-2">
      <Field label="Title"><input className="input" value={f.title || ""} onChange={up("title")} /></Field>
      <Field label="Subtitle / eyebrow"><input className="input" value={f.subtitle || ""} onChange={up("subtitle")} /></Field>
      <div className="sm:col-span-2"><Field label="Body text"><textarea className="input h-20 py-2" value={f.body || ""} onChange={up("body")} /></Field></div>
      <Field label="Button label"><input className="input" value={f.cta_label || ""} onChange={up("cta_label")} /></Field>
      <Field label="Button link"><input className="input" value={f.cta_url || ""} onChange={up("cta_url")} placeholder="/shop?category=jhumkas" /></Field>
      <Field label="Image"><ImageInput value={f.image_url} onChange={(url) => setF({ ...f, image_url: url })} /></Field>
      <div className="sm:col-span-2"><button className="btn-primary h-10" onClick={() => onSave({ title: f.title, subtitle: f.subtitle, body: f.body, cta_label: f.cta_label, cta_url: f.cta_url, image_url: f.image_url })} data-testid={`section-save-${s.section_key}`}>Save & publish</button></div>
    </div>
  );
}

function Banners() {
  const { reload } = useStore();
  const [rows, setRows] = useState([]);
  const load = useCallback(() => supabase.from("banners").select("*").order("placement").order("sort_order").then(({ data }) => setRows(data || [])), []);
  useEffect(() => { load(); }, [load]);
  const save = async (b) => {
    const { id, created_at, ...row } = b;
    row.starts_at = row.starts_at || null; row.ends_at = row.ends_at || null;
    const { error } = id ? await supabase.from("banners").update(row).eq("id", id) : await supabase.from("banners").insert(row);
    if (error) return toast.error(errMsg(error)); toast.success("Banner saved"); load(); reload();
  };
  const del = async (id) => { if (confirmAction("Delete this banner?")) { await supabase.from("banners").delete().eq("id", id); load(); reload(); } };
  const upd = (i, k, v) => setRows((r) => r.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Banners" action={<div className="flex gap-2"><button className="btn-outline h-10" onClick={() => setRows([...rows, { placement: "hero", title: "", subtitle: "", image_url: "", cta_label: "Shop now", cta_url: "/shop", sort_order: rows.length, is_active: true }])} data-testid="add-hero-banner-btn">+ Hero</button><button className="btn-outline h-10" onClick={() => setRows([...rows, { placement: "promo", title: "", subtitle: "", image_url: "", cta_label: "Shop now", cta_url: "/shop", sort_order: rows.length, is_active: true }])} data-testid="add-promo-banner-btn">+ Promo</button></div>}>
      <div className="space-y-4">{rows.map((b, i) => (
        <div key={b.id || i} className="grid sm:grid-cols-2 gap-3 p-4 border" data-testid="banner-row">
          <p className="sm:col-span-2 text-xs uppercase tracking-wider text-muted-foreground">{b.placement} banner</p>
          <Field label="Heading"><input className="input" value={b.title || ""} onChange={(e) => upd(i, "title", e.target.value)} /></Field>
          <Field label="Description"><input className="input" value={b.subtitle || ""} onChange={(e) => upd(i, "subtitle", e.target.value)} /></Field>
          <Field label="Button label"><input className="input" value={b.cta_label || ""} onChange={(e) => upd(i, "cta_label", e.target.value)} /></Field>
          <Field label="Button link"><input className="input" value={b.cta_url || ""} onChange={(e) => upd(i, "cta_url", e.target.value)} /></Field>
          <Field label="Show from (optional)"><input type="datetime-local" className="input" value={(b.starts_at || "").slice(0, 16)} onChange={(e) => upd(i, "starts_at", e.target.value)} /></Field>
          <Field label="Show until (optional)"><input type="datetime-local" className="input" value={(b.ends_at || "").slice(0, 16)} onChange={(e) => upd(i, "ends_at", e.target.value)} /></Field>
          <Field label="Image"><ImageInput folder="banners" value={b.image_url} onChange={(url) => upd(i, "image_url", url)} /></Field>
          <div className="flex items-end gap-3"><label className="text-sm flex gap-2"><input type="checkbox" checked={b.is_active} onChange={(e) => upd(i, "is_active", e.target.checked)} />Active</label><button className="btn-primary h-10" onClick={() => save(b)} data-testid="banner-save-btn">Save</button>{b.id && <button className="text-red-700 p-2" onClick={() => del(b.id)} aria-label="Delete banner"><Trash2 size={15} /></button>}</div>
        </div>
      ))}</div>
    </Card>
  );
}

function Pages() {
  const { settings } = useStore();
  const keys = Object.keys(settings.pages || {});
  const [k, setK] = useState(keys[0] || "about");
  const [pages, setPages] = useState(settings.pages || {});
  const save = async () => { const { error } = await supabase.from("store_settings").update({ value: pages, updated_at: new Date().toISOString() }).eq("key", "pages"); if (error) toast.error(errMsg(error)); else toast.success("Page published"); };
  const cur = pages[k] || { title: "", body: "" };
  return (
    <Card title="About, policies & care pages">
      <p className="text-xs text-amber-800 -mt-3 mb-4">Policy texts are templates — please review them (ideally with a legal professional) before launch.</p>
      <select className="input mb-3" value={k} onChange={(e) => setK(e.target.value)} data-testid="page-select">{keys.map((x) => <option key={x} value={x}>{pages[x]?.title || x}</option>)}</select>
      <Field label="Title"><input className="input" value={cur.title} onChange={(e) => setPages({ ...pages, [k]: { ...cur, title: e.target.value } })} /></Field>
      <div className="mt-3"><Field label="Content"><textarea className="input h-56 py-2" value={cur.body} onChange={(e) => setPages({ ...pages, [k]: { ...cur, body: e.target.value } })} data-testid="page-body-input" /></Field></div>
      <button className="btn-primary h-10 mt-3" onClick={save} data-testid="page-save-btn">Save & publish</button>
    </Card>
  );
}

function Faq() {
  const { settings } = useStore();
  const [items, setItems] = useState(settings.faq?.items || []);
  const save = async () => { const { error } = await supabase.from("store_settings").update({ value: { items } }).eq("key", "faq"); if (error) toast.error(errMsg(error)); else toast.success("FAQ published"); };
  return (
    <Card title="FAQ" action={<button className="btn-outline h-10" onClick={() => setItems([...items, { q: "", a: "" }])}>Add question</button>}>
      {items.map((it, i) => <div key={i} className="grid gap-2 py-3 border-b"><input className="input" placeholder="Question" value={it.q} onChange={(e) => setItems(items.map((x, n) => (n === i ? { ...x, q: e.target.value } : x)))} /><textarea className="input h-16 py-2" placeholder="Answer" value={it.a} onChange={(e) => setItems(items.map((x, n) => (n === i ? { ...x, a: e.target.value } : x)))} /><button className="text-xs link-u text-red-700 text-left" onClick={() => setItems(items.filter((_, n) => n !== i))}>Remove</button></div>)}
      <button className="btn-primary h-10 mt-3" onClick={save}>Save & publish</button>
    </Card>
  );
}

export default function Content() {
  const { role } = useAuth();
  if (!can(role, "content")) return <p>You don't have permission to edit content.</p>;
  return (
    <div className="space-y-6" data-testid="admin-content">
      <PageTitle title="Website content" />
      <SettingForm k="announcement" title="Announcement bar" fields={[["enabled", "Show announcement", "bool"], ["text", "Text"], ["link", "Link (optional)"]]} />
      <Banners />
      <Sections />
      <SettingForm k="brand" title="Brand & logo" fields={[["name", "Store name"], ["tagline", "Tagline"], ["logo_url", "Logo", "image"], ["favicon_url", "Favicon", "image"]]} />
      <SettingForm k="contact" title="Contact, support hours & social links" fields={[["email", "Support email"], ["phone", "Support phone"], ["whatsapp", "WhatsApp number (with country code) for chat button"], ["hours", "Support hours"], ["address", "Business address", "textarea"], ["instagram", "Instagram URL"], ["facebook", "Facebook URL"], ["youtube", "YouTube URL"]]} />
      <SettingForm k="seo" title="SEO (home page & defaults)" fields={[["title", "Site title"], ["description", "Meta description", "textarea"], ["og_image", "Social share image", "image"]]} />
      <Pages />
      <Faq />
    </div>
  );
}
