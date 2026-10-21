import { useState } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { Field, Spinner } from "../components/Bits";
import { Card } from "./kit";

export default function LocationPricing() {
  const { settings, reload } = useStore();
  const [v, setV] = useState({ enabled: false, radius_km: 10, extra_amount: 0, ...(settings.location_pricing || {}) });
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value === "" ? "" : Number(e.target.value) });
  const here = () => {
    if (!navigator.geolocation) return toast.error("This browser can't share location");
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setV((x) => ({ ...x, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) })); setFinding(false); toast.success("Store location set — press Save"); },
      () => { setFinding(false); toast.error("Location permission was blocked"); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const save = async (e) => {
    e.preventDefault();
    if (v.enabled && (v.lat === "" || v.lat == null || v.lng === "" || v.lng == null)) return toast.error("Set your store location first");
    if (v.enabled && !(v.radius_km > 0)) return toast.error("Distance must be more than 0 km");
    setBusy(true);
    const { error } = await supabase.from("store_settings").upsert({ key: "location_pricing", value: v, is_public: false, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Location pricing saved"); reload();
  };
  return (
    <Card title="Location pricing">
      <p className="text-xs text-muted-foreground -mt-3 mb-4">Shoppers are asked for their current location when they open the site. Anyone farther than the distance below, or who blocks location, sees every price (and sale price) increased by the extra amount, and pays it at checkout. Shoppers are never told about this rule, and these settings are not visible to them.</p>
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4" data-testid="location-pricing-form">
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.enabled} onChange={set("enabled")} data-testid="location-enabled" />Location pricing on</label>
        <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
          <Field label="Store latitude"><input className="input w-40" type="number" step="any" value={v.lat ?? ""} onChange={set("lat")} data-testid="location-lat" /></Field>
          <Field label="Store longitude"><input className="input w-40" type="number" step="any" value={v.lng ?? ""} onChange={set("lng")} data-testid="location-lng" /></Field>
          <button type="button" className="btn-outline h-10" onClick={here} disabled={finding} data-testid="location-use-current-btn">{finding ? <Spinner /> : <><MapPin size={15} />Use my current location</>}</button>
          {v.lat != null && v.lat !== "" && <a className="text-xs underline h-10 inline-flex items-center" href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer" data-testid="location-map-link">Check on map</a>}
        </div>
        <Field label="Nearby distance (km)"><input className="input" type="number" min="0.1" step="0.1" value={v.radius_km ?? ""} onChange={set("radius_km")} data-testid="location-radius" /></Field>
        <Field label="Extra per item for farther shoppers (₹)"><input className="input" type="number" min="0" step="1" value={v.extra_amount ?? ""} onChange={set("extra_amount")} data-testid="location-extra" /></Field>
        {v.extra_amount > 0 && <p className="sm:col-span-2 text-xs text-muted-foreground" data-testid="location-example">Example: ₹999 → ₹{999 + v.extra_amount}, sale ₹799 → ₹{799 + v.extra_amount} for shoppers beyond {v.radius_km || 0} km.</p>}
        <div className="sm:col-span-2"><button className="btn-primary h-10" disabled={busy} data-testid="location-save-btn">{busy ? <Spinner /> : "Save"}</button></div>
      </form>
    </Card>
  );
}
