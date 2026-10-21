import { useState } from "react";
import { toast } from "sonner";
import { Images, X } from "lucide-react";
import { supabase, errMsg, uploadImage } from "../lib/supabase";
import { Card } from "./kit";

// "IMZ-001.jpg", "IMZ-001-2.jpg", "IMZ-001_3.png", "IMZ-001 (4).webp" all match SKU IMZ-001
const baseName = (f) => f.name.replace(/\.[^.]+$/, "").trim();
const strip = (s) => s.replace(/\s*\(\d+\)$/, "").replace(/[-_ ]\d{1,2}$/, "");

export function matchFiles(files, products) {
  const by = Object.fromEntries(products.map((p) => [p.sku.toLowerCase(), p]));
  return files.map((file) => {
    const b = baseName(file).toLowerCase();
    return { file, product: by[b] || by[strip(b)] || null };
  }).sort((a, b) => baseName(a.file).localeCompare(baseName(b.file), undefined, { numeric: true }));
}

export default function BulkPhotos({ onClose, onDone }) {
  const [list, setList] = useState(null);
  const [prog, setProg] = useState(null);
  const pick = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = ""; if (!files.length) return;
    const { data, error } = await supabase.from("products").select("id,sku,name").limit(5000);
    if (error) return toast.error(errMsg(error));
    setList(matchFiles(files, data || []));
  };
  const ok = (list || []).filter((x) => x.product);
  const go = async () => {
    const ids = [...new Set(ok.map((x) => x.product.id))];
    const { data: cur } = await supabase.from("product_images").select("product_id").in("product_id", ids);
    const count = Object.fromEntries(ids.map((id) => [id, (cur || []).filter((c) => c.product_id === id).length]));
    let done = 0, failed = 0;
    setProg(0);
    for (const x of ok) {
      try {
        const url = await uploadImage(x.file, "products");
        const pid = x.product.id;
        const { error } = await supabase.from("product_images").insert({ product_id: pid, url, alt: x.product.name, sort_order: count[pid], is_primary: count[pid] === 0 });
        if (error) throw error;
        count[pid]++; done++;
      } catch { failed++; }
      setProg(done + failed);
    }
    setProg(null); setList(null); onDone();
    failed ? toast.error(`${done} photos added, ${failed} failed`) : toast.success(`${done} photos added to ${ids.length} products`);
  };
  return (
    <Card title="Bulk upload photos" action={<button onClick={onClose} className="p-2" aria-label="Close photo upload" data-testid="bulk-photos-close-btn"><X size={16} /></button>}>
      <div data-testid="bulk-photos-card">
        <p className="text-sm text-muted-foreground -mt-2 mb-4">Name each photo with the product's SKU, e.g. <b>IMZ-ER-001.jpg</b>. For more photos of the same product add a number: <b>IMZ-ER-001-2.jpg</b>, <b>IMZ-ER-001-3.jpg</b>. Photos are added after any existing ones; the first photo of a product without photos becomes its main photo.</p>
        <label className="btn-primary h-10 cursor-pointer"><Images size={15} />Choose photos<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={pick} disabled={prog != null} data-testid="bulk-photos-input" /></label>
        {list && <PhotoPreview list={list} ok={ok} prog={prog} go={go} />}
      </div>
    </Card>
  );
}

function PhotoPreview({ list, ok, prog, go }) {
  const miss = list.length - ok.length;
  return (
    <div className="mt-5" data-testid="bulk-photos-preview">
      <p className="text-sm mb-2" data-testid="bulk-photos-summary">{ok.length} of {list.length} photos matched{miss > 0 && <span className="text-amber-700"> · {miss} have no matching SKU and will be skipped</span>}</p>
      <div className="overflow-y-auto max-h-72 border divide-y text-xs">{list.map((x, i) => (
        <div key={i} className={`flex justify-between gap-3 p-2 ${x.product ? "" : "bg-amber-50"}`} data-testid={`bulk-photo-row-${i}`}>
          <span className="truncate">{x.file.name}</span><span className={`truncate text-right ${x.product ? "" : "text-amber-700"}`}>{x.product ? `${x.product.sku} · ${x.product.name}` : "No product with this SKU"}</span>
        </div>
      ))}</div>
      <button className="btn-primary h-11 mt-4" disabled={!ok.length || prog != null} onClick={go} data-testid="bulk-photos-upload-btn">{prog != null ? `Uploading ${prog} / ${ok.length}…` : `Upload ${ok.length} photos`}</button>
    </div>
  );
}
