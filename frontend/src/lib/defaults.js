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

export const SAMPLE_SECTION_TEXT = {
  bestsellers: { title: "Bestsellers", subtitle: "Our most-loved pieces", cta_label: "View all", cta_url: "/shop?sort=popular" },
  new_arrivals: { title: "New Arrivals", subtitle: "Freshly crafted, just landed", cta_label: "View all", cta_url: "/shop?sort=newest" },
  trending: { title: "Trending Now", subtitle: "What everyone is wearing", cta_label: "View all", cta_url: "/shop" },
  festive: { title: "Festive Edit", subtitle: "Shine at every celebration", cta_label: "View all", cta_url: "/shop" },
  categories: { title: "Shop by Category", subtitle: "Find your style" },
  offer: { title: "Festive Sale — Up to 30% Off", subtitle: "Limited time only", body: "Handpicked pieces at special prices", cta_label: "Shop the offer", cta_url: "/shop?collection=sale" },
  marquee: { body: "Free shipping on orders above ₹999\nCash on delivery available\n7-day easy returns\nAnti-tarnish collection now live\nDesigned in India" },
  features: { body: "Cash on Delivery | Pay when your order arrives\nFree Shipping | On orders above ₹999\n7-Day Returns | Easy returns & exchange\nAnti-Tarnish | Everyday shine that lasts" },
  tabs: { title: "Shop by Mood" },
  recently_viewed: { title: "Recently Viewed" },
  testimonials: { title: "From Our Customers", body: "[Sample] Priya S. | Beautiful jhumkas, exactly like the photos. Got so many compliments!\n[Sample] Ananya R. | The anti-tarnish ring still shines after weeks of daily wear.\n[Sample] Meera K. | Lovely packaging and quick delivery. Will order again." },
  story: { title: "Wear elegance. Share Kindness", subtitle: "Our story", body: "[Your brand story — a few lines on how IMINATIONZ began.]", cta_label: "Read our story", cta_url: "/pages/about", image_url: "/demo/story.jpg" },
  care: { title: "Caring for your jewellery", body: "Keep away from water and perfume · Wipe with a soft cloth · Store in an airtight pouch", cta_label: "Care guide", cta_url: "/pages/care" },
  newsletter: { title: "Join the IMINATIONZ circle", subtitle: "New launches and offers, a few times a month. Unsubscribe anytime." },
};

// [name, sku, category slug, price, sale price, stock, image, flags]
export const SAMPLE_PRODUCTS = [
  ["Kundan Pearl Jhumka", "SAMPLE-01", "earrings", 1299, 899, 5, "/demo/jhumka.jpg", "is_featured,is_new,is_bestseller,is_festive"],
  ["Minimal Gold Studs", "SAMPLE-02", "earrings", 599, null, 12, "/demo/studs.jpg", "is_new,is_trending,is_anti_tarnish"],
  ["Stackable Ring Trio", "SAMPLE-03", "rings", 799, 649, 8, "/demo/rings.jpg", "is_bestseller,is_trending,is_anti_tarnish"],
  ["Coin Charm Chain", "SAMPLE-04", "chains", 999, null, 6, "/demo/chain.jpg", "is_new,is_trending,is_anti_tarnish"],
  ["Twisted Cuff Bracelet", "SAMPLE-05", "bracelets", 1099, 949, 6, "/demo/bracelet.jpg", "is_bestseller,is_anti_tarnish"],
  ["Layered Festive Necklace", "SAMPLE-06", "necklaces", 1899, 1499, 4, "/demo/necklace.jpg", "is_new,is_trending,is_festive"],
  ["Everyday Jewellery Set", "SAMPLE-07", "pendants", 2199, 1799, 7, "/demo/set.jpg", "is_bestseller,is_festive"],
  ["Pearl Drop Pendant", "SAMPLE-08", "pendants", 899, null, 9, "/demo/necklace.jpg", "is_new,is_bestseller,is_festive"],
];

export const DEFAULT_CATEGORIES = ["Earrings", "Jhumkas", "Studs", "Baliyan", "Rings", "Bangles", "Bracelets", "Pendants", "Chains", "Mangalsutra", "Necklaces", "Jewellery Sets", "Festive", "Daily Wear", "Office Wear", "Anti-Tarnish"];
