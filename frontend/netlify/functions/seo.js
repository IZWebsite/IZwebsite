const { admin } = require("./_shared/lib");

const site = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

exports.sitemap = async () => {
  const db = admin();
  const [{ data: products }, { data: cats }] = await Promise.all([
    db.from("products").select("slug,updated_at").eq("status", "published"),
    db.from("categories").select("slug").eq("is_visible", true),
  ]);
  const urls = [["/", null], ["/shop", null], ...["about", "shipping", "returns", "care", "faq", "privacy", "terms"].map((p) => [`/pages/${p}`, null]),
    ...(cats || []).map((c) => [`/shop?category=${c.slug}`, null]), ...(products || []).map((p) => [`/product/${p.slug}`, p.updated_at])];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>${esc(site() + u)}</loc>${d ? `<lastmod>${d.slice(0, 10)}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  return { statusCode: 200, headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }, body };
};

exports.handler = async (event) => {
  if (event.queryStringParameters?.robots || (event.path || "").includes("robots")) {
    return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart\nDisallow: /order/\nDisallow: /login\nDisallow: /register\nSitemap: ${site()}/sitemap.xml\n` };
  }
  return exports.sitemap();
};
