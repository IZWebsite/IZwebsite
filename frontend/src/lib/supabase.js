import { createClient } from "@supabase/supabase-js";
import { getGeo } from "./geo";

const geoFetch = (url, opts = {}) => {
  const c = getGeo().coords;
  if (!c) return fetch(url, opts);
  const headers = new Headers(opts.headers);
  headers.set("x-geo", `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`);
  return fetch(url, { ...opts, headers });
};

export const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: geoFetch },
});

export const errMsg = (e) =>
  (e?.message || "Something went wrong. Please try again.").replace(/^(CART_INVALID|COUPON_INVALID|INVALID_TRANSITION|FORBIDDEN):\s*/, "");

export async function callFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  let res;
  try {
    res = await fetch(`${process.env.REACT_APP_FUNCTIONS_BASE}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error("Server functions are unreachable. They run on the Netlify deployment.");
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: "Server functions are not available on this host (they run on Netlify)." }; }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

async function optimise(file, maxSide = 1600) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.86));
  return blob && blob.size < file.size ? new File([blob], "image.webp", { type: "image/webp" }) : file;
}

export async function uploadImage(file, folder = "products") {
  if (!TYPES.includes(file.type) && !(folder === "brand" && ["image/svg+xml", "image/x-icon"].includes(file.type))) {
    throw new Error("Please upload a JPG, PNG, WebP or AVIF image");
  }
  if (file.size > MAX_BYTES * 2) throw new Error("Image must be under 10 MB");
  const out = folder === "brand" ? file : await optimise(file);
  if (out.size > MAX_BYTES) throw new Error("Image is too large after optimisation (max 5 MB)");
  const ext = out.type.split("/")[1].replace("svg+xml", "svg").replace("x-icon", "ico");
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("store-media").upload(path, out, { contentType: out.type, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("store-media").getPublicUrl(path).data.publicUrl;
}
