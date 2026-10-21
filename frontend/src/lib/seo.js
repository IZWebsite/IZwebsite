import { useEffect } from "react";
import { useStore } from "../context/StoreContext";

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content || "");
}

export function useSeo({ title, description, image, jsonLd, noindex } = {}) {
  const { settings } = useStore();
  useEffect(() => {
    const seo = settings.seo || {};
    const t = title ? `${title} | ${settings.brand?.name || "IMINATIONZ"}` : seo.title || "IMINATIONZ";
    const d = description || seo.description || "";
    const url = window.location.origin + window.location.pathname;
    document.title = t;
    setMeta("name", "description", d);
    setMeta("name", "robots", noindex ? "noindex,nofollow" : "index,follow");
    setMeta("property", "og:title", t);
    setMeta("property", "og:description", d);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", new URL(image || seo.og_image || "/demo/hero.jpg", window.location.origin).href);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = url;
    let script = document.getElementById("jsonld");
    if (jsonLd) {
      if (!script) { script = document.createElement("script"); script.type = "application/ld+json"; script.id = "jsonld"; document.head.appendChild(script); }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) script.remove();
  }, [title, description, image, jsonLd, noindex, settings]);
}
