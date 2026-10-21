import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase, errMsg, callFunction } from "../lib/supabase";
import { useAuth, can, PERMS } from "../context/AuthContext";
import { fmtDate } from "../lib/format";
import { Field } from "../components/Bits";
import { Card, PageTitle, SettingForm, confirmAction } from "./kit";

function Integrations() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { callFunction("integration-status", {}).then(setS).catch((e) => setErr(e.message)); }, []);
  const Row = ({ ok, label, hint }) => <div className="flex items-start gap-3 py-2 border-b last:border-0 text-sm">{ok ? <CheckCircle2 size={18} className="text-emerald-700 shrink-0" /> : <XCircle size={18} className="text-muted-foreground shrink-0" />}<div><p>{label}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div></div>;
  return (
    <Card title="Integration health">
      {err ? <p className="text-sm text-amber-800" data-testid="integration-status-error">{err} Server functions run only on the Netlify deployment.</p> : !s ? <p className="text-sm">Checking…</p> : <>
        <Row ok={s.supabase_service} label="Supabase server access" hint="SUPABASE_SERVICE_ROLE_KEY in Netlify env" />
        <Row ok={s.razorpay} label={`Razorpay ${s.razorpay_mode || ""}`} hint="RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET" />
        <Row ok={s.razorpay_webhook} label="Razorpay webhook secret" hint="RAZORPAY_WEBHOOK_SECRET" />
        <Row ok={s.email} label="Email (Resend)" hint="RESEND_API_KEY + EMAIL_FROM" />
        <Row ok={s.whatsapp} label="WhatsApp Cloud API" hint="WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID + approved templates" />
        <p className="text-xs text-muted-foreground mt-3">Secrets are never shown here — only whether they are configured.</p>
      </>}
    </Card>
  );
}

function NotificationLog() {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => supabase.from("notification_logs").select("id,channel,audience,event,status,attempts,last_error,created_at,sent_at,orders(order_number)").order("created_at", { ascending: false }).limit(50).then(({ data }) => setRows(data || [])), []);
  useEffect(() => { load(); }, [load]);
  const run = async () => { try { const r = await callFunction("process-notifications", {}); toast.success(`Processed ${r.processed}`); load(); } catch (e) { toast.error(e.message); } };
  const tone = { sent: "text-emerald-700", failed: "text-red-700", skipped: "text-muted-foreground", pending: "text-amber-700" };
  return (
    <Card title="Notification log" action={<button className="btn-outline h-9" onClick={run} data-testid="process-notifications-btn">Send pending now</button>}>
      {rows.length ? <div className="divide-y text-sm">{rows.map((n) => (
        <div key={n.id} className="py-2 grid grid-cols-2 md:grid-cols-[110px_1fr_1fr_90px] gap-2" data-testid="notification-log-row"><span className="text-xs text-muted-foreground">{fmtDate(n.created_at, true)}</span><span>{n.channel} → {n.audience} · {n.event.replace(/_/g, " ")} {n.orders?.order_number}</span><span className="text-xs text-muted-foreground truncate">{n.last_error}</span><span className={tone[n.status]}>{n.status}{n.attempts > 1 && ` (${n.attempts})`}</span></div>
      ))}</div> : <p className="text-sm text-muted-foreground">No notifications yet.</p>}
    </Card>
  );
}

function Staff() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ email: "", role: "fulfilment" });
  const load = useCallback(() => supabase.rpc("admin_staff").then(({ data }) => setRows(data || [])), []);
  useEffect(() => { load(); }, [load]);
  const set = async (email, role) => {
    if (!role && !confirmAction(`Remove admin access for ${email}?`)) return;
    const { error } = await supabase.rpc("admin_set_role", { p_email: email, p_role: role });
    if (error) return toast.error(errMsg(error)); toast.success(role ? "Access granted" : "Access removed"); setF({ ...f, email: "" }); load();
  };
  return (
    <Card title="Staff & permissions">
      <p className="text-xs text-muted-foreground -mt-3 mb-4">The person must first register a normal customer account. Then grant a role here.</p>
      <div className="flex flex-wrap gap-2 mb-5"><input className="input flex-1 min-w-[200px]" type="email" placeholder="staff@email.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="staff-email-input" /><select className="input w-auto" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid="staff-role-select">{Object.keys(PERMS).map((r) => <option key={r}>{r}</option>)}</select><button className="btn-primary h-11" onClick={() => set(f.email, f.role)} data-testid="staff-grant-btn">Grant</button></div>
      <div className="divide-y text-sm">{rows.map((r) => <div key={r.user_id} className="flex items-center justify-between py-2"><span>{r.email} · <span className="text-muted-foreground">{r.role}</span></span>{r.user_id !== user.id && <button className="link-u text-red-700 text-xs" onClick={() => set(r.email, null)}>Remove</button>}</div>)}</div>
      <div className="mt-5 text-xs text-muted-foreground space-y-1">{Object.entries(PERMS).map(([r, p]) => <p key={r}><span className="font-medium text-foreground">{r}</span>: {p.join(", ")}</p>)}</div>
    </Card>
  );
}

function Audit() {
  const [rows, setRows] = useState([]);
  useEffect(() => { supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(40).then(({ data }) => setRows(data || [])); }, []);
  return <Card title="Admin activity (audit log)">{rows.map((r) => <p key={r.id} className="text-xs py-1 border-b">{fmtDate(r.created_at, true)} · {r.action} {r.entity} <span className="text-muted-foreground">{r.entity_id}</span></p>)}</Card>;
}

export default function Settings() {
  const { role } = useAuth();
  if (!can(role, "settings")) return (
    <div className="space-y-6"><PageTitle title="Settings" /><Card title="Restricted"><p className="text-sm">Only the owner can change store settings, payments, integrations and staff.</p></Card></div>
  );
  return (
    <div className="space-y-6" data-testid="admin-settings">
      <PageTitle title="Settings" />
      <p className="text-xs text-muted-foreground">Currency: INR · Time zone: Asia/Kolkata</p>
      <Integrations />
      <SettingForm k="payments" title="Payments" note="Enable online payments only after Razorpay keys show as configured above. COD deducts stock when the order is placed; online orders hold stock for the reservation window until payment is verified." fields={[["cod_enabled", "Cash on Delivery enabled", "bool"], ["razorpay_enabled", "Online payment (Razorpay) enabled", "bool"], ["reservation_minutes", "Hold stock for unpaid online orders (minutes)", "number"], ["cod_max_order", "Max order value for COD (₹, 0 = no limit)", "number"]]} />
      <SettingForm k="shipping" title="Shipping" fields={[["flat_fee", "Flat shipping fee (₹)", "number"], ["free_above", "Free shipping above (₹)", "number"], ["estimate_text", "Delivery estimate text"], ["pincode_prefixes", "Serviceable PIN prefixes (comma separated, blank = all India)"]]} />
      <SettingForm k="tax" title="Tax" note="[Confirm with your accountant] Jewellery GST rate and whether your prices include GST." fields={[["mode", "Prices are", "select", ["inclusive", "exclusive"]], ["rate", "GST rate (%)", "number"], ["label", "Tax label"]]} />
      <SettingForm k="policies" title="Returns & cancellation rules" fields={[["return_window_days", "Return window (days after delivery)", "number"], ["cancellation_note", "Cancellation note"]]} />
      <SettingForm k="notifications" title="Notifications" note="Owner alerts: new orders, payment failures, cancellations, return requests, low stock and out-of-stock." fields={[["owner_email", "Owner alert email"], ["owner_whatsapp", "Owner WhatsApp (e.g. +9198…)"], ["owner_email_enabled", "Email alerts to owner", "bool"], ["owner_whatsapp_enabled", "WhatsApp alerts to owner", "bool"], ["customer_email_enabled", "Customer order emails", "bool"], ["customer_whatsapp_enabled", "Customer WhatsApp updates (opted-in only)", "bool"]]} />
      <SettingForm k="analytics" title="Analytics" fields={[["enabled", "First-party analytics enabled", "bool"]]} />
      <SettingForm k="maintenance" title="Maintenance mode" note="Shoppers see the message; logged-in staff still see the store." fields={[["enabled", "Maintenance mode on", "bool"], ["message", "Message", "textarea"]]} />
      <NotificationLog />
      <Staff />
      <Audit />
      <Card title="Backups"><p className="text-sm text-muted-foreground">Supabase takes daily backups on paid plans. On the free plan export regularly: Products → CSV, Orders → CSV, or run <code>pg_dump</code> (see README → Backups).</p><Field label="Last viewed"><span className="text-sm">{fmtDate(new Date(), true)}</span></Field></Card>
    </div>
  );
}
