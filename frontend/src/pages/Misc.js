import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useSeo } from "../lib/seo";
import { STATUS, fmtDate } from "../lib/format";
import { Empty, Field } from "../components/Bits";

export function InfoPage() {
  const { slug } = useParams();
  const { settings } = useStore();
  const page = slug === "faq" ? { title: "Frequently Asked Questions" } : slug === "contact" ? { title: "Contact us" } : settings.pages?.[slug];
  useSeo({ title: page?.title });
  if (!page) return <NotFound />;
  const c = settings.contact || {};
  return (
    <article className="container-x py-14 md:py-20 max-w-3xl" data-testid={`info-page-${slug}`}>
      <p className="eyebrow mb-3">IMINATIONZ</p>
      <h1 className="font-display text-4xl md:text-5xl mb-10">{page.title}</h1>
      {slug === "faq" ? ((settings.faq?.items || []).length ? settings.faq.items.map((f, i) => <div key={i} className="border-b py-5"><p className="font-display text-xl">{f.q}</p><p className="text-sm text-muted-foreground mt-2">{f.a}</p></div>) : <p className="text-sm text-muted-foreground">Answers are coming soon. Please <Link to="/pages/contact" className="link-u">contact us</Link> with any question.</p>)
        : slug === "contact" ? <div className="space-y-2 text-sm">{[["Email", c.email], ["Phone", c.phone], ["Hours", c.hours], ["", c.address]].filter(([, v]) => v).map(([l, v]) => <p key={l + v}>{l && `${l}: `}{v}</p>)}{!c.email && !c.phone && <p className="text-muted-foreground">Contact details will be added soon.</p>}</div>
        : <div className="text-[15px] leading-relaxed text-foreground/85 whitespace-pre-line">{page.body}</div>}
    </article>
  );
}

export function Track() {
  const [f, setF] = useState({ n: "", e: "" });
  const [r, setR] = useState(null);
  useSeo({ title: "Track your order", noindex: true });
  const guest = JSON.parse(localStorage.getItem("imz_guest_orders") || "[]");
  const go = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase.rpc("track_order", { p_order_number: f.n.trim().toUpperCase(), p_email: f.e.trim() });
    if (error) { setR(null); return toast.error(errMsg(error)); }
    setR(data);
  };
  return (
    <div className="container-x py-14 max-w-xl" data-testid="track-page">
      <h1 className="font-display text-4xl mb-8">Track your order</h1>
      <form onSubmit={go} className="space-y-4">
        <Field label="Order number"><input required className="input uppercase" placeholder="IMZ…" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} data-testid="track-order-number-input" /></Field>
        <Field label="Email used at checkout"><input required type="email" className="input" value={f.e} onChange={(e) => setF({ ...f, e: e.target.value })} data-testid="track-email-input" /></Field>
        <button className="btn-primary w-full" data-testid="track-submit-btn">Track</button>
      </form>
      {r && <div className="card-x p-5 mt-8 text-sm space-y-1" data-testid="track-result"><p className="font-medium">{r.order_number} — {STATUS[r.status]}</p><p>Placed {fmtDate(r.created_at)}</p>{r.courier_name && <p>{r.courier_name} {r.tracking_number}</p>}{r.tracking_url && <a className="link-u" href={r.tracking_url} target="_blank" rel="noreferrer">Track shipment →</a>}<p className="text-xs text-muted-foreground pt-2">For full details use the link in your confirmation email.</p></div>}
      {guest.length > 0 && <div className="mt-10"><p className="label">Orders placed on this device</p>{guest.map((g) => <Link key={g.n} to={`/order/${g.n}?t=${g.t}`} className="block link-u text-sm py-1">{g.n}</Link>)}</div>}
    </div>
  );
}

export function NotFound() {
  useSeo({ title: "Page not found", noindex: true });
  return <div className="container-x py-24"><Empty title="This page has wandered off" text="The page you're looking for doesn't exist." action="Back to home" to="/" testid="not-found" /></div>;
}
