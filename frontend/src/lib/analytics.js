import { useEffect } from "react";
import { supabase } from "./supabase";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16)));

export const getConsent = () => localStorage.getItem("imz_consent");
export const setConsent = (v) => localStorage.setItem("imz_consent", v);

function ids() {
  let v = localStorage.getItem("imz_vid");
  if (!v) { v = uid(); localStorage.setItem("imz_vid", v); }
  let s = sessionStorage.getItem("imz_sid");
  if (!s) {
    s = uid(); sessionStorage.setItem("imz_sid", s);
    const p = new URLSearchParams(window.location.search);
    const ref = document.referrer && !document.referrer.includes(window.location.host) ? document.referrer : null;
    sessionStorage.setItem("imz_src", JSON.stringify({ utm_source: p.get("utm_source"), utm_medium: p.get("utm_medium"), utm_campaign: p.get("utm_campaign"), referrer: ref }));
  }
  return { visitor_id: v, session_id: s, ...JSON.parse(sessionStorage.getItem("imz_src") || "{}") };
}

const device = () => (window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop");

export function track(event_type, extra = {}) {
  if (getConsent() !== "granted") return;
  const p = { event_id: uid(), event_type, path: window.location.pathname, device: device(), ...ids(), ...extra };
  supabase.rpc("track_event", { p }).then(() => {});
}

export function usePageView(pathname) {
  useEffect(() => {
    if (!pathname.startsWith("/admin")) track("page_view");
  }, [pathname]);
}

export { uid };
