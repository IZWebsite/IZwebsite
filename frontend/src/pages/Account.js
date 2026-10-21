import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import { useSeo } from "../lib/seo";
import { inr, fmtDate, download } from "../lib/format";
import ProductCard from "../components/ProductCard";
import { Empty, Field, StatusBadge } from "../components/Bits";

function Orders({ user }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { supabase.from("orders").select("order_number,created_at,status,total,payment_status").eq("user_id", user.id).order("created_at", { ascending: false }).then(({ data }) => setRows(data || [])); }, [user]);
  if (!rows) return <p className="text-sm">Loading…</p>;
  if (!rows.length) return <Empty title="No orders yet" action="Start shopping" to="/shop" testid="orders-empty" />;
  return <div className="divide-y border-y">{rows.map((o) => (
    <Link key={o.order_number} to={`/order/${o.order_number}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-secondary/40 px-2" data-testid={`account-order-${o.order_number}`}>
      <div><p className="font-medium">{o.order_number}</p><p className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</p></div>
      <StatusBadge status={o.status} /><span className="text-sm">{inr(o.total)}</span>
    </Link>))}</div>;
}

function Wishlist() {
  const { wishlist } = useShop();
  const [rows, setRows] = useState([]);
  useEffect(() => { if (wishlist.length) supabase.from("catalog").select("*").in("id", wishlist).then(({ data }) => setRows(data || [])); else setRows([]); }, [wishlist]);
  if (!rows.length) return <Empty title="Your wishlist is empty" text="Tap the heart on any piece to save it here." action="Browse jewellery" to="/shop" testid="wishlist-empty" />;
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-10">{rows.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}

const blank = { full_name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", is_default: false };
function Addresses({ user }) {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null);
  const load = () => supabase.from("addresses").select("*").order("is_default", { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    if (f.is_default) await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
    const row = { ...f, user_id: user.id };
    const { error } = f.id ? await supabase.from("addresses").update(row).eq("id", f.id) : await supabase.from("addresses").insert(row);
    if (error) return toast.error(errMsg(error).includes("pincode") ? "Please enter a valid PIN code" : errMsg(error));
    setF(null); load(); toast.success("Address saved");
  };
  const del = async (id) => { await supabase.from("addresses").delete().eq("id", id); load(); };
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <div className="space-y-4">
      {rows.map((a) => <div key={a.id} className="card-x p-4 flex justify-between gap-4 text-sm" data-testid="address-card"><div><p className="font-medium">{a.full_name} {a.is_default && <span className="chip ml-2">Default</span>}</p><p className="text-muted-foreground">{a.line1}{a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.pincode} · {a.phone}</p></div><div className="flex gap-3 shrink-0"><button className="link-u" onClick={() => setF(a)}>Edit</button><button className="link-u text-red-700" onClick={() => del(a.id)}>Delete</button></div></div>)}
      {f ? (
        <form onSubmit={save} className="card-x p-5 grid sm:grid-cols-2 gap-4" data-testid="address-form">
          <Field label="Full name"><input required className="input" value={f.full_name} onChange={up("full_name")} /></Field>
          <Field label="Phone"><input required className="input" value={f.phone} onChange={up("phone")} /></Field>
          <Field label="Address line 1"><input required className="input" value={f.line1} onChange={up("line1")} /></Field>
          <Field label="Address line 2"><input className="input" value={f.line2 || ""} onChange={up("line2")} /></Field>
          <Field label="City"><input required className="input" value={f.city} onChange={up("city")} /></Field>
          <Field label="State"><input required className="input" value={f.state} onChange={up("state")} /></Field>
          <Field label="PIN code"><input required className="input" maxLength={6} value={f.pincode} onChange={up("pincode")} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_default} onChange={up("is_default")} />Default address</label>
          <div className="sm:col-span-2 flex gap-2"><button className="btn-primary h-10" data-testid="address-save-btn">Save</button><button type="button" className="btn-ghost h-10" onClick={() => setF(null)}>Cancel</button></div>
        </form>
      ) : <button className="btn-outline" onClick={() => setF(blank)} data-testid="add-address-btn">Add address</button>}
    </div>
  );
}

function Profile({ user }) {
  const { profile, refreshProfile, signOut } = useAuth();
  const [f, setF] = useState({ full_name: profile?.full_name || "", phone: profile?.phone || "", whatsapp_opt_in: !!profile?.whatsapp_opt_in, marketing_opt_in: !!profile?.marketing_opt_in });
  const save = async (e) => {
    e.preventDefault();
    if (f.phone && !/^\+[1-9][0-9]{7,14}$/.test(f.phone)) return toast.error("Phone must include country code, e.g. +919876543210");
    const { error } = await supabase.from("profiles").update({ ...f, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (error) return toast.error(errMsg(error));
    toast.success("Profile updated"); refreshProfile();
  };
  const exportData = async () => {
    const [p, a, o, w, r] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id), supabase.from("addresses").select("*"),
      supabase.from("orders").select("*, order_items(*)").eq("user_id", user.id), supabase.from("wishlists").select("*"), supabase.from("product_reviews").select("*").eq("user_id", user.id),
    ]);
    download("iminationz-my-data.json", JSON.stringify({ email: user.email, profile: p.data, addresses: a.data, orders: o.data, wishlist: w.data, reviews: r.data }, null, 2), "application/json");
  };
  const requestDelete = async () => {
    if (!window.confirm("Request deletion of your account? Our team will process it and email you. Order records required for accounting are retained.")) return;
    const { error } = await supabase.rpc("request_account_deletion");
    if (error) toast.error(errMsg(error)); else { toast.success("Deletion requested"); refreshProfile(); }
  };
  return (
    <div className="grid md:grid-cols-2 gap-10">
      <form onSubmit={save} className="space-y-4" data-testid="profile-form">
        <Field label="Email"><input className="input" value={user.email} disabled /></Field>
        <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} data-testid="profile-name-input" /></Field>
        <Field label="Phone (with country code)"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="profile-phone-input" /></Field>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.whatsapp_opt_in} onChange={(e) => setF({ ...f, whatsapp_opt_in: e.target.checked })} />WhatsApp order updates</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.marketing_opt_in} onChange={(e) => setF({ ...f, marketing_opt_in: e.target.checked })} />Marketing emails</label>
        <button className="btn-primary" data-testid="profile-save-btn">Save changes</button>
      </form>
      <div className="space-y-4">
        <div className="card-x p-5"><p className="font-display text-xl mb-2">Your data</p><p className="text-sm text-muted-foreground mb-4">Download everything we store about you.</p><button className="btn-outline h-10" onClick={exportData} data-testid="export-data-btn">Export my data</button></div>
        <div className="card-x p-5"><p className="font-display text-xl mb-2">Delete account</p>{profile?.deletion_requested_at ? <p className="text-sm" data-testid="deletion-requested">Deletion requested on {fmtDate(profile.deletion_requested_at)}.</p> : <button className="btn-outline h-10 border-red-700 text-red-700 hover:bg-red-700" onClick={requestDelete} data-testid="request-deletion-btn">Request deletion</button>}</div>
        <button className="btn-ghost" onClick={signOut} data-testid="logout-btn">Log out</button>
      </div>
    </div>
  );
}

const TABS = [["orders", "Orders"], ["wishlist", "Wishlist"], ["addresses", "Addresses"], ["profile", "Profile & privacy"]];
export default function Account() {
  const { user, loading, profile, isStaff } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "orders";
  useSeo({ title: "My account", noindex: true });
  if (loading) return <div className="h-[50vh]" />;
  if (!user) return tab === "wishlist" ? <div className="container-x py-12"><h1 className="font-display text-4xl mb-8">Wishlist</h1><Wishlist /></div> : <Navigate to="/login?next=/account" replace />;
  return (
    <div className="container-x py-10 md:py-14" data-testid="account-page">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-8"><div><p className="eyebrow mb-2">My account</p><h1 className="font-display text-4xl">Hello, {profile?.full_name?.split(" ")[0] || "there"}</h1></div>{isStaff && <Link to="/admin" className="btn-gold h-10" data-testid="go-admin-link">Open admin</Link>}</div>
      <div className="flex gap-6 border-b mb-8 overflow-x-auto no-scrollbar">{TABS.map(([k, l]) => <button key={k} onClick={() => setSp({ tab: k })} className={`pb-3 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? "border-foreground" : "border-transparent text-muted-foreground"}`} data-testid={`account-tab-${k}`}>{l}</button>)}</div>
      {tab === "orders" && <Orders user={user} />}
      {tab === "wishlist" && <Wishlist />}
      {tab === "addresses" && <Addresses user={user} />}
      {tab === "profile" && <Profile user={user} />}
    </div>
  );
}
