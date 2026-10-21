import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { supabase, errMsg } from "../lib/supabase";
import { inr } from "../lib/format";
import { Card, PageTitle, Stat } from "./kit";

export function useRange() {
  const [preset, setPreset] = useState("30");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    if (preset === "custom" && custom.from && custom.to) return { from: new Date(custom.from + "T00:00:00+05:30"), to: new Date(custom.to + "T23:59:59+05:30") };
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (Number(preset === "custom" ? 30 : preset) - 1));
    return { from: start, to: end };
  }, [preset, custom]);
  const picker = (
    <div className="flex flex-wrap gap-2 items-center">
      <select className="input h-10 w-auto" value={preset} onChange={(e) => setPreset(e.target.value)} data-testid="range-select"><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="custom">Custom</option></select>
      {preset === "custom" && <><input type="date" className="input h-10 w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><input type="date" className="input h-10 w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></>}
    </div>
  );
  return { range, picker };
}

export function group(rows, by, keys) {
  if (by === "day") return rows;
  const m = new Map();
  rows.forEach((r) => {
    const d = new Date(r.day);
    const k = by === "month" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : (() => { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); })();
    const cur = m.get(k) || { day: k, ...Object.fromEntries(keys.map((x) => [x, 0])) };
    keys.forEach((x) => { cur[x] += Number(r[x] || 0); }); m.set(k, cur);
  });
  return [...m.values()];
}

export default function Overview() {
  const { range, picker } = useRange();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [by, setBy] = useState("day");
  useEffect(() => {
    supabase.rpc("admin_dashboard", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data); });
  }, [range]);
  if (err) return <p className="text-red-700">{err}</p>;
  if (!d) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-card border" />)}</div>;
  const trend = group(d.trend, by, ["orders", "revenue"]);
  return (
    <div className="space-y-6" data-testid="admin-overview">
      <PageTitle title="Overview">{picker}</PageTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Today's orders" value={d.today_orders} hint={inr(d.today_sales)} testid="stat-today-orders" />
        <Link to="/admin/orders?status=confirmed"><Stat label="Awaiting processing" value={d.awaiting_processing} testid="stat-awaiting" /></Link>
        <Link to="/admin/orders?status=ready_to_ship"><Stat label="Ready to ship" value={d.ready_to_ship} testid="stat-ready" /></Link>
        <Stat label="Needs attention" value={d.needs_attention} hint="Cancellation / return requests" testid="stat-attention" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Orders (valid)" value={d.orders} hint="Excludes failed & cancelled" testid="stat-orders" />
        <Stat label="Gross sales" value={inr(d.gross_sales)} hint="Item value before discounts" testid="stat-gross" />
        <Stat label="Net sales" value={inr(d.net_sales)} hint="After discounts & refunds, excl. shipping" testid="stat-net" />
        <Stat label="Payments collected" value={inr(d.payments_collected)} hint="Online paid + delivered COD" testid="stat-collected" />
        <Stat label="Avg order value" value={inr(d.aov)} testid="stat-aov" />
        <Stat label="Shipped / delivered" value={`${d.shipped} / ${d.delivered}`} testid="stat-shipped" />
        <Stat label="Cancelled / failed pay" value={`${d.cancelled} / ${d.failed_payments}`} testid="stat-cancelled" />
        <Stat label="Customers" value={d.customers} hint={`${d.new_customers} new in range`} testid="stat-customers" />
      </div>
      <Card title="Revenue & orders" action={<select className="input h-9 w-auto" value={by} onChange={(e) => setBy(e.target.value)} data-testid="trend-group-select"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select>}>
        <div className="h-64"><ResponsiveContainer><AreaChart data={trend}><CartesianGrid stroke="#e8dfd2" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v, n) => (n === "revenue" ? inr(v) : v)} /><Area dataKey="revenue" stroke="#B08D57" fill="#E8D9BF" /></AreaChart></ResponsiveContainer></div>
        <div className="h-32 mt-4"><ResponsiveContainer><BarChart data={trend}><XAxis dataKey="day" hide /><Tooltip /><Bar dataKey="orders" fill="#2b2420" /></BarChart></ResponsiveContainer></div>
      </Card>
      <div className="grid md:grid-cols-3 gap-6">
        <Card title="Bestsellers">{d.bestsellers.length ? d.bestsellers.map((b) => <div key={b.name} className="flex justify-between text-sm py-1.5 border-b last:border-0"><span className="truncate pr-3">{b.name}</span><span>{b.qty} · {inr(b.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">No sales in this range.</p>}</Card>
        <Card title={`Low stock (${d.low_stock.length})`}>{d.low_stock.map((p) => <Link key={p.id} to={`/admin/products/${p.id}`} className="flex justify-between text-sm py-1.5 border-b last:border-0"><span className="truncate pr-3">{p.name}</span><span className="text-amber-700">{p.available} left</span></Link>)}{!d.low_stock.length && <p className="text-sm text-muted-foreground">All good.</p>}</Card>
        <Card title={`Out of stock (${d.out_of_stock.length})`}>{d.out_of_stock.map((p) => <Link key={p.id} to={`/admin/products/${p.id}`} className="block text-sm py-1.5 border-b last:border-0 truncate">{p.name}</Link>)}{!d.out_of_stock.length && <p className="text-sm text-muted-foreground">None.</p>}</Card>
      </div>
      <p className="text-xs text-muted-foreground">Active products: {d.active_products}. All figures come from real orders in your database; time zone Asia/Kolkata.</p>
    </div>
  );
}
