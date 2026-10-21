// Default store setup (same as supabase/migrations/0003_seed.sql, without demo products)
export const DEFAULT_SETTINGS = {
  brand: [{ name: "IMINATIONZ", tagline: "Wear elegance. Share Kindness", logo_url: "", favicon_url: "" }, true],
  announcement: [{ enabled: true, text: "Free shipping on orders above ₹999", link: "/shop" }, true],
  contact: [{ email: "[support@yourdomain.com]", phone: "[+91 XXXXX XXXXX]", whatsapp: "", address: "[Your business address]", hours: "Mon–Sat, 10am–7pm IST", instagram: "", facebook: "", youtube: "" }, true],
  payments: [{ cod_enabled: true, razorpay_enabled: false, reservation_minutes: 15, cod_max_order: 0 }, true],
  shipping: [{ flat_fee: 79, free_above: 999, estimate_text: "Usually delivered in 4–8 business days after dispatch", pincode_prefixes: "" }, true],
  tax: [{ mode: "inclusive", rate: 3, label: "GST" }, true],
  policies: [{ return_window_days: 7, cancellation_note: "Orders can be cancelled before they are packed for shipping." }, true],
  seo: [{ title: "IMINATIONZ — Premium Imitation & Anti-Tarnish Jewellery", description: "Shop elegant earrings, jhumkas, necklaces, bangles and anti-tarnish jewellery from IMINATIONZ. Wear elegance. Share Kindness.", og_image: "/demo/hero.jpg" }, true],
  maintenance: [{ enabled: false, message: "We are updating our store. Please check back shortly." }, true],
  analytics: [{ enabled: true, require_consent: true }, true],
  faq: [{ items: [{ q: "Is the jewellery anti-tarnish?", a: "Only products marked Anti-Tarnish carry that finish. Please check each product page." }, { q: "How long does delivery take?", a: "Most orders are delivered in 4–8 business days after dispatch." }] }, true],
  pages: [{
    about: { title: "Our Story", body: "[Write your brand story here — who you are, why you started IMINATIONZ, and what makes your jewellery special.]" },
    shipping: { title: "Shipping Policy", body: "[Review before launch] We ship across India. Orders are dispatched within 1–3 business days. Delivery usually takes 4–8 business days after dispatch. Shipping is free above ₹999; a flat fee applies below that." },
    returns: { title: "Returns, Exchange & Refunds", body: "[Review before launch] Returns are accepted within 7 days of delivery for unused items in original packaging. Refunds are issued to the original payment method within 5–7 business days of approval." },
    cancellation: { title: "Cancellation Policy", body: "[Review before launch] You can cancel an order from your account before it is packed. Paid orders are refunded after cancellation is approved." },
    privacy: { title: "Privacy Policy", body: "[Review with a legal professional before launch] We collect your name, contact details and address only to process orders and provide support. Payments are processed by Razorpay; we never store card details. Analytics is first-party and consent-based." },
    terms: { title: "Terms & Conditions", body: "[Review with a legal professional before launch] By placing an order you agree to our pricing, shipping, cancellation and return policies." },
    care: { title: "Jewellery Care", body: "Keep jewellery away from perfume, water and sweat. Wipe gently with a soft dry cloth after use. Store each piece separately in an airtight pouch." },
  }, true],
  notifications: [{ owner_email: "", owner_whatsapp: "", owner_email_enabled: true, owner_whatsapp_enabled: false, customer_email_enabled: true, customer_whatsapp_enabled: true }, false],
};

export const DEFAULT_SECTIONS = [
  ["hero", "Hero banner"], ["marquee", "Scrolling offer strip (one message per line in Body)"],
  ["categories", "Featured categories"], ["features", "Trust highlights (Body: Title | text, one per line)"],
  ["bestsellers", "Bestsellers", "Bestsellers", "Our most-loved pieces", "View all", "/shop?sort=popular"],
  ["offer", "Offer band", null, null, "Shop the offer", "/shop?collection=sale"],
  ["new_arrivals", "New arrivals", "New Arrivals", "Freshly crafted, just landed", "View all", "/shop?sort=newest"],
  ["tabs", "Tabbed collections", "Shop by Mood"], ["promo", "Promotional banners"],
  ["recently_viewed", "Recently viewed", "Recently Viewed"], ["testimonials", "Customer reviews", "From Our Customers"],
  ["story", "Brand story", "Wear elegance. Share Kindness", "Our story", "Read our story", "/pages/about", "[Your brand story — a few lines on how IMINATIONZ began.]", "/demo/story.jpg"],
  ["care", "Jewellery care", "Caring for your jewellery", null, "Care guide", "/pages/care", "Keep away from water and perfume · Wipe with a soft cloth · Store in an airtight pouch"],
  ["newsletter", "Newsletter", "Join the IMINATIONZ circle", "New launches and offers, a few times a month. Unsubscribe anytime."],
].map(([section_key, label, title = null, subtitle = null, cta_label = null, cta_url = null, body = null, image_url = null], i) => ({ section_key, label, title, subtitle, cta_label, cta_url, body, image_url, sort_order: i + 1, is_visible: true }));

export const DEFAULT_CATEGORIES = ["Earrings", "Jhumkas", "Studs", "Baliyan", "Rings", "Bangles", "Bracelets", "Pendants", "Chains", "Mangalsutra", "Necklaces", "Jewellery Sets", "Festive", "Daily Wear", "Office Wear", "Anti-Tarnish"];
