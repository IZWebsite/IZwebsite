import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { inr, fmtDate, STATUS } from "../lib/format";
import { Spinner } from "../components/Bits";
import { Card, PageTitle, confirmAction } from "./kit";

function Detail({ c, onClose, isOwner }) {
  const [orders, setOrders] = useState([]);
  const [addr, setAddr] = useState([]);
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    const [o, a, n] = await Promise.all([
      supabase.from("orders").select("id,order_number,created_at,status,total").eq("user_id", c.id).order("created_at", { ascending: false }),
      supabase.from("addresses").select("*").eq("user_id", c.id),
      supabase.from("staff_notes").select("*").eq("entity", "customer").eq("entity_id", c.id).order("created_at", { ascending: false }),
    ]);
    setOrders(o.data || []); setAddr(a.data || []); setNotes(n.data || []);
  }, [c.id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("staff_notes").insert({ entity: "customer", entity_id: c.id, note, created_by: user.id });
    if (error) return toast.error(errMsg(error)); setNote(""); load();
  };
  const del = async () => {
    if (!confirmAction(`Permanently delete ${c.email}'s account? Profile, addresses, cart and wishlist are erased; order records are kept for accounting without the account link.`)) return;
    const { error } = await supabase.rpc("admin_delete_customer", { p_user_id: c.id });
    if (error) return toast.error(errMsg(error)); toast.success("Account deleted"); onClose(true);
  };
  return (
    <Card title={c.full_name || c.email} action={<button className="btn-ghost h-9" onClick={() => onClose(false)}>Close</button>}>
      <div className="grid md:grid-cols-2 gap-6 text-sm">
        <div className="space-y-1"><p>{c.email}</p><p>{c.phone}</p><p className="text-muted-foreground">Joined {fmtDate(c.created_at)} · {c.order_count} orders · {inr(c.lifetime_spend)} lifetime</p><p className="text-xs">Marketing: {c.marketing_opt_in ? "yes" : "no"} · WhatsApp: {c.whatsapp_opt_in ? "yes" : "no"}</p>
          {c.deletion_requested_at && <p className="text-amber-800">Deletion requested {fmtDate(c.deletion_requested_at)}</p>}
          {addr.map((a) => <p key={a.id} className="text-xs text-muted-foreground">{a.line1}, {a.city} {a.pincode}</p>)}
          {isOwner && <button className="btn-outline h-9 mt-3 border-red-700 text-red-700 hover:bg-red-700" onClick={del} data-testid="delete-customer-btn">Delete account</button>}
        </div>
        <div><p className="label">Orders</p>{orders.map((o) => <a key={o.id} href={`/admin/orders/${o.id}`} className="flex justify-between py-1 border-b"><span>{o.order_number}</span><span className="text-muted-foreground">{STATUS[o.status]}</span><span>{inr(o.total)}</span></a>)}
          <p className="label mt-5">Support notes (staff only)</p><div className="flex gap-2"><input className="input h-9" value={note} onChange={(e) => setNote(e.target.value)} data-testid="customer-note-input" /><button className="btn-outline h-9" disabled={!note.trim()} onClick={add}>Add</button></div>
          {notes.map((n) => <p key={n.id} className="text-xs py-1 border-b">{n.note} <span className="text-muted-foreground">· {fmtDate(n.created_at)}</span></p>)}
        </div>
      </div>
    </Card>
  );
}

export default function Customers() {
  const { role } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const load = useCallback(() => supabase.rpc("admin_customers", { p_search: q || null }).then(({ data, error }) => (error ? toast.error(errMsg(error)) : setRows(data || []))), [q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-6" data-testid="admin-customers">
      <PageTitle title="Customers" />
      <input className="input" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} data-testid="customers-search-input" />
      {sel && <Detail c={sel} isOwner={role === "owner"} onClose={(changed) => { setSel(null); if (changed) load(); }} />}
      {!rows ? <Spinner /> : <div className="bg-card border divide-y">{rows.map((c) => (
        <button key={c.id} onClick={() => setSel(c)} className="w-full grid grid-cols-2 md:grid-cols-4 gap-2 p-4 text-left text-sm hover:bg-secondary/50" data-testid="customer-row">
          <span className="truncate">{c.full_name || "—"}{c.deletion_requested_at && <span className="text-amber-800 text-xs"> · deletion requested</span>}</span><span className="truncate text-muted-foreground">{c.email}</span><span>{c.order_count} orders</span><span className="text-right">{inr(c.lifetime_spend)}</span>
        </button>
      ))}{!rows.length && <p className="p-6 text-sm text-muted-foreground">No customers yet.</p>}</div>}
      <p className="text-xs text-muted-foreground">Customer contact data is visible only to staff with customer permission. Bulk messaging is not available by design.</p>
    </div>
  );
}
