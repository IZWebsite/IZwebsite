import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState({ settings: {}, categories: [], sections: [], banners: [], ready: false, setupMissing: false });

  const load = useCallback(async () => {
    const [s, c, h, b] = await Promise.all([
      supabase.from("store_settings").select("key,value"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("homepage_content").select("*").order("sort_order"),
      supabase.from("banners").select("*").order("sort_order"),
    ]);
    const missing = [s, c].some((r) => r.error && ["PGRST205", "42P01"].includes(r.error.code));
    setState({
      settings: Object.fromEntries((s.data || []).map((r) => [r.key, r.value])),
      categories: c.data || [], sections: h.data || [], banners: b.data || [], ready: true, setupMissing: missing,
      loadError: !missing && s.error ? s.error.message : null,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const fav = state.settings.brand?.favicon_url;
    if (fav) {
      let l = document.querySelector('link[rel="icon"]');
      if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
      l.href = fav;
    }
  }, [state.settings.brand]);

  return <Ctx.Provider value={{ ...state, reload: load }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
