import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";
import { setGeo, useGeo } from "../lib/geo";
import { Spinner } from "./Bits";

const zone = async () => {
  const { data } = await supabase.rpc("price_zone");
  return data || { enabled: false, extra: 0 };
};

const locate = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 });
});

async function resolveZone() {
  const coords = await locate();
  setGeo({ coords });
  const z = await zone();
  setGeo({ extra: Number(z.extra || 0), status: coords ? "granted" : "denied" });
  sessionStorage.setItem("imz_geo_asked", "1");
}

async function start() {
  const z = await zone();
  if (!z.enabled) return setGeo({ status: "off", extra: 0 });
  const perm = await navigator.permissions?.query({ name: "geolocation" }).catch(() => null);
  if (perm?.state === "granted" || sessionStorage.getItem("imz_geo_asked")) return resolveZone();
  setGeo({ status: "ask", extra: Number(z.extra || 0) });
}

export default function LocationGate() {
  const { status } = useGeo();
  const { pathname } = useLocation();
  useEffect(() => { start().catch(() => setGeo({ status: "off" })); }, []);
  if (status !== "ask" || pathname.startsWith("/admin")) return null;
  return <GateModal />;
}

function GateModal() {
  const allow = () => { setGeo({ status: "locating" }); resolveZone().catch(() => setGeo({ status: "denied" })); };
  return (
    <div className="fixed inset-0 z-[100] bg-[#2b2420]/70 backdrop-blur-md grid place-items-center p-4" data-testid="location-gate">
      <div className="bg-background max-w-md w-full rounded-xl p-7 md:p-9 text-center shadow-2xl reveal">
        <span className="mx-auto h-14 w-14 rounded-full bg-[color:var(--champagne)] grid place-items-center text-[color:var(--gold)]"><MapPin size={26} /></span>
        <h2 className="font-display text-2xl md:text-3xl mt-5">Do we deliver to you?</h2>
        <p className="text-sm text-muted-foreground mt-3">Allow location access so we can check delivery to your area and show you the right shipping options.</p>
        <button className="btn-primary h-12 w-full mt-7" onClick={allow} data-testid="location-allow-btn">Allow location</button>
        <p className="text-[11px] text-muted-foreground mt-4">We only use your current location for this check. It is never shared.</p>
      </div>
    </div>
  );
}

export function LocatingOverlay() {
  const { status } = useGeo();
  if (status !== "locating") return null;
  return <div className="fixed inset-0 z-[100] bg-background/80 grid place-items-center" data-testid="location-checking"><div className="text-center"><Spinner /><p className="text-sm mt-3">Checking your area…</p></div></div>;
}
