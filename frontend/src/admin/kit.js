import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { supabase, errMsg, uploadImage } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { Field, Spinner } from "../components/Bits";

export const Card = ({ title, children, action, className = "" }) => (
  <section className={`bg-card border p-5 md:p-6 ${className}`}>
    {(title || action) && <div className="flex items-center justify-between gap-3 mb-5"><h2 className="font-display text-xl md:text-2xl">{title}</h2>{action}</div>}
    {children}
  </section>
);

export const PageTitle = ({ title, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-6"><h1 className="font-display text-3xl md:text-4xl">{title}</h1><div className="flex flex-wrap gap-2">{children}</div></div>
);

export function ImageInput({ value, onChange, folder = "content", testid }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { onChange(await uploadImage(f, folder)); toast.success("Image uploaded"); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false); e.target.value = "";
  };
  return (
    <div className="flex items-center gap-3">
      {value ? <img src={value} alt="" className="h-16 w-16 object-cover border" /> : <div className="h-16 w-16 border grid place-items-center text-muted-foreground"><ImagePlus size={18} /></div>}
      <label className="btn-outline h-10 cursor-pointer">{busy ? <Spinner /> : "Upload"}<input type="file" accept="image/*" className="hidden" onChange={pick} data-testid={testid} /></label>
      {value && <button type="button" className="text-xs link-u" onClick={() => onChange("")}>Remove</button>}
    </div>
  );
}

// fields: [key, label, type('text'|'textarea'|'number'|'bool'|'image'|'select'), options]
export function SettingForm({ k, fields, title, note }) {
  const { settings, reload } = useStore();
  const [v, setV] = useState(settings[k] || {});
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("store_settings").upsert({ key: k, value: v, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Saved and published"); reload();
  };
  return (
    <Card title={title}>
      {note && <p className="text-xs text-muted-foreground -mt-3 mb-4">{note}</p>}
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4" data-testid={`setting-form-${k}`}>
        {fields.map(([f, label, type = "text", opts]) => (
          <div key={f} className={type === "textarea" ? "sm:col-span-2" : ""}>
            {type === "bool" ? <label className="flex items-center gap-2 text-sm h-full"><input type="checkbox" checked={!!v[f]} onChange={(e) => setV({ ...v, [f]: e.target.checked })} data-testid={`setting-${k}-${f}`} />{label}</label>
              : type === "image" ? <Field label={label}><ImageInput folder="brand" value={v[f]} onChange={(url) => setV({ ...v, [f]: url })} testid={`setting-${k}-${f}`} /></Field>
              : type === "select" ? <Field label={label}><select className="input" value={v[f] ?? ""} onChange={(e) => setV({ ...v, [f]: e.target.value })} data-testid={`setting-${k}-${f}`}>{opts.map((o) => <option key={o}>{o}</option>)}</select></Field>
              : type === "textarea" ? <Field label={label}><textarea className="input h-28 py-2" value={v[f] ?? ""} onChange={(e) => setV({ ...v, [f]: e.target.value })} data-testid={`setting-${k}-${f}`} /></Field>
              : <Field label={label}><input className="input" type={type} value={v[f] ?? ""} onChange={(e) => setV({ ...v, [f]: type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} data-testid={`setting-${k}-${f}`} /></Field>}
          </div>
        ))}
        <div className="sm:col-span-2 flex items-center gap-3"><button className="btn-primary h-10" disabled={busy} data-testid={`setting-save-${k}`}>{busy ? <Spinner /> : "Save"}</button><Revisions k={k} onRestore={(d) => setV(d.value)} /></div>
      </form>
    </Card>
  );
}

function Revisions({ k, onRestore }) {
  const [rows, setRows] = useState(null);
  const open = async () => {
    const { data } = await supabase.from("content_revisions").select("id,data,created_at").eq("entity", "store_settings").eq("entity_key", k).order("created_at", { ascending: false }).limit(5);
    setRows(data || []);
  };
  if (!rows) return <button type="button" className="text-xs link-u text-muted-foreground" onClick={open}>Version history</button>;
  if (!rows.length) return <span className="text-xs text-muted-foreground">No earlier versions</span>;
  return <select className="input h-9 w-auto text-xs" defaultValue="" onChange={(e) => { const r = rows.find((x) => x.id === e.target.value); if (r) { onRestore(r.data); toast("Earlier version loaded — press Save to publish it"); } }}>
    <option value="" disabled>Restore a version…</option>{rows.map((r) => <option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString("en-IN")}</option>)}
  </select>;
}

export const Stat = ({ label, value, hint, testid }) => (
  <div className="bg-card border p-4" data-testid={testid}><p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="font-display text-2xl md:text-3xl mt-1">{value}</p>{hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}</div>
);

export const confirmAction = (msg) => window.confirm(msg);
