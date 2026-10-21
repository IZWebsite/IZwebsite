import { useState } from "react";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { slugify } from "../lib/format";
import { DEFAULT_SETTINGS, DEFAULT_SECTIONS, DEFAULT_CATEGORIES } from "../lib/defaults";
import { Spinner } from "../components/Bits";

// Owner-only one-tap setup: creates missing settings, homepage sections and categories (never overwrites).
export default function SetupDefaults() {
  const { settings, sections, categories, reload } = useStore();
  const [busy, setBusy] = useState(false);
  const missing = Object.keys(DEFAULT_SETTINGS).filter((k) => !settings[k]);
  if (!missing.length && sections.length && categories.length) return null;
  const run = async () => {
    setBusy(true);
    const ops = [];
    if (missing.length) ops.push(supabase.from("store_settings").insert(missing.map((k) => ({ key: k, value: DEFAULT_SETTINGS[k][0], is_public: DEFAULT_SETTINGS[k][1] }))));
    if (!sections.length) ops.push(supabase.from("homepage_content").insert(DEFAULT_SECTIONS));
    if (!categories.length) ops.push(supabase.from("categories").insert(DEFAULT_CATEGORIES.map((name, i) => ({ name, slug: slugify(name), sort_order: i + 1, is_featured: i < 6 }))));
    const res = await Promise.all(ops);
    setBusy(false);
    const err = res.find((r) => r.error);
    if (err) return toast.error(errMsg(err.error));
    toast.success("Store defaults created — review them in Settings and Website content");
    reload();
  };
  return (
    <div className="bg-[color:var(--champagne)] p-5 flex flex-wrap items-center justify-between gap-4" data-testid="setup-defaults-card">
      <div><p className="font-display text-xl">Finish store setup</p><p className="text-sm">Creates default payment, shipping, tax and policy settings, homepage sections and categories. Nothing existing is changed.</p></div>
      <button className="btn-primary h-11" disabled={busy} onClick={run} data-testid="setup-defaults-btn">{busy ? <Spinner /> : "Set up store defaults"}</button>
    </div>
  );
}
