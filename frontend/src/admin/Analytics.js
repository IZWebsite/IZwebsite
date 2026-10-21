import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase, errMsg } from "../lib/supabase";
import { fmtDate } from "../lib/format";
import { useRange } from "./Overview";
import { Card, PageTitle, Stat } from "./kit";

const List = ({ rows, k, v }) => rows.length ? rows.map((r, i) => <div key={i} className="flex justify-between text-sm py-1.5 border-b last:border-0"><span className="truncate pr-3">{r[k] || "—"}</span><span>{r[v]}</span></div>) : <p className="text-sm text-muted-foreground">No data yet.</p>;

export default function Analytics() {
  const { range, picker } = useRange();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const go = () => supabase.rpc("admin_traffic", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
    go(); const t = setInterval(go, 30000); return () => clearInterval(t);
  }, [range]);
  if (err) return <p className="text-red-700">{err}</p>;
  if (!d) return <div className="h-40 bg-card border animate-pulse" />;
  const conv = d.unique_visitors ? ((d.order_visitors / d.unique_visitors) * 100).toFixed(2) : "0.00";
  const aband = d.checkout_visitors ? (100 - (d.order_visitors / d.checkout_visitors) * 100).toFixed(1) : "—";
  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <PageTitle title="Traffic & activity">{picker}</PageTitle>
      <p className="text-xs text-muted-foreground">First-party, consent-based tracking. Visitors who decline cookies are not counted. Tracking since {d.tracking_since ? fmtDate(d.tracking_since) : "— (no events yet)"}; no data exists before that.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active now (est.)" value={d.live_visitors} hint="Visitors with activity in the last 5 min" testid="stat-live" />
        <Stat label="Unique visitors" value={d.unique_visitors} testid="stat-visitors" />
        <Stat label="Page views" value={d.page_views} testid="stat-pageviews" />
        <Stat label="Product views" value={d.product_views} testid="stat-productviews" />
        <Stat label="Searches" value={d.searches} />
        <Stat label="Add to bag" value={d.add_to_cart} />
        <Stat label="Conversion rate" value={`${conv}%`} hint="Visitors who placed an order" testid="stat-conversion" />
        <Stat label="Checkout abandonment" value={aband === "—" ? aband : `${aband}%`} hint={`${d.checkout_visitors} started · ${d.order_visitors} ordered`} />
      </div>
      <Card title="Daily visitors"><div className="h-56"><ResponsiveContainer><LineChart data={d.daily}><CartesianGrid stroke="#e8dfd2" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line dataKey="visitors" stroke="#B08D57" dot={false} /><Line dataKey="views" stroke="#2b2420" dot={false} /></LineChart></ResponsiveContainer></div></Card>
      <div className="grid md:grid-cols-3 gap-6">
        <Card title="Most viewed"><List rows={d.top_products} k="name" v="views" /></Card>
        <Card title="Most added to bag"><List rows={d.top_cart} k="name" v="adds" /></Card>
        <Card title="Top searches"><List rows={d.top_searches} k="query" v="n" /></Card>
        <Card title="Sources"><List rows={d.sources} k="source" v="visitors" /></Card>
        <Card title="Campaigns (UTM)"><List rows={d.campaigns} k="campaign" v="visitors" /></Card>
        <Card title="Devices"><List rows={d.devices} k="device" v="visitors" /></Card>
        <Card title="Popular categories"><List rows={d.top_categories} k="category" v="n" /></Card>
      </div>
    </div>
  );
}
