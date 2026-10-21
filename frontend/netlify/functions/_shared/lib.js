const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const env = (k) => process.env[k] || "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const asUser = (jwt) => createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const safeEq = (a, b) => { const x = Buffer.from(String(a || "")); const y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const rawBody = (event) => (event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "");
const parse = (event) => { try { return JSON.parse(rawBody(event) || "{}"); } catch { return {}; } };

// best-effort per-instance rate limit
const hits = new Map();
function limited(event, max = 30, windowMs = 60000) {
  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "anon";
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

const razorpayReady = () => !!(env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET"));
async function rzp(path, method = "GET", body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: "Basic " + Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString("base64"), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
  return data;
}

async function staffFromEvent(event) {
  const jwt = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const db = admin();
  const { data } = await db.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: r } = await db.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
  return r ? { user: data.user, role: r.role, jwt } : null;
}

async function userFromEvent(event) {
  const jwt = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin().auth.getUser(jwt);
  return data?.user || null;
}

module.exports = { env, admin, asUser, json, hmac, safeEq, rawBody, parse, limited, rzp, razorpayReady, staffFromEvent, userFromEvent };
