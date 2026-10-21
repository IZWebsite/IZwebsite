-- Default settings, categories, homepage sections and DEMO products (is_demo = true; delete before launch)
insert into public.store_settings (key, value, is_public) values
('brand', '{"name":"IMINATIONZ","tagline":"Wear elegance. Share Kindness","logo_url":"","favicon_url":""}', true),
('announcement', '{"enabled":true,"text":"Free shipping on orders above ₹999 · Anti-tarnish collection now live","link":"/shop?collection=anti-tarnish"}', true),
('contact', '{"email":"[support@yourdomain.com]","phone":"[+91 XXXXX XXXXX]","whatsapp":"","address":"[Your business address]","hours":"Mon–Sat, 10am–7pm IST","instagram":"","facebook":"","youtube":""}', true),
('payments', '{"cod_enabled":true,"razorpay_enabled":false,"reservation_minutes":15,"cod_max_order":0}', true),
('shipping', '{"flat_fee":79,"free_above":999,"estimate_text":"Usually delivered in 4–8 business days after dispatch","pincode_prefixes":""}', true),
('tax', '{"mode":"inclusive","rate":3,"label":"GST"}', true),
('policies', '{"return_window_days":7,"cancellation_note":"Orders can be cancelled before they are packed for shipping."}', true),
('seo', '{"title":"IMINATIONZ — Premium Imitation & Anti-Tarnish Jewellery","description":"Shop elegant earrings, jhumkas, necklaces, bangles and anti-tarnish jewellery from IMINATIONZ. Wear elegance. Share Kindness.","og_image":"/demo/hero.jpg"}', true),
('maintenance', '{"enabled":false,"message":"We are updating our store. Please check back shortly."}', true),
('analytics', '{"enabled":true,"require_consent":true}', true),
('faq', '{"items":[{"q":"Is the jewellery anti-tarnish?","a":"Only products marked Anti-Tarnish carry that finish. Please check each product page."},{"q":"How long does delivery take?","a":"Most orders are delivered in 4–8 business days after dispatch."},{"q":"Do you offer Cash on Delivery?","a":"Yes, where enabled at checkout."}]}', true),
('pages', '{
 "about":{"title":"Our Story","body":"[Write your brand story here — who you are, why you started IMINATIONZ, and what makes your jewellery special.]"},
 "shipping":{"title":"Shipping Policy","body":"[Review before launch] We ship across India. Orders are dispatched within 1–3 business days. Delivery usually takes 4–8 business days after dispatch depending on your location. Shipping is free above ₹999; a flat fee applies below that."},
 "returns":{"title":"Returns, Exchange & Refunds","body":"[Review before launch] Returns are accepted within 7 days of delivery for unused items in original packaging. Earrings are not returnable for hygiene reasons unless damaged. Refunds are issued to the original payment method within 5–7 business days of approval."},
 "cancellation":{"title":"Cancellation Policy","body":"[Review before launch] You can cancel an order from your account before it is packed. Paid orders are refunded after cancellation is approved."},
 "privacy":{"title":"Privacy Policy","body":"[Review with a legal professional before launch] We collect your name, contact details and address only to process orders and provide support. Payments are processed by Razorpay; we never store card details. Analytics is first-party and consent-based. You can export or request deletion of your data from your account."},
 "terms":{"title":"Terms & Conditions","body":"[Review with a legal professional before launch] By placing an order you agree to our pricing, shipping, cancellation and return policies."},
 "care":{"title":"Jewellery Care","body":"Keep jewellery away from perfume, water and sweat. Wipe gently with a soft dry cloth after use. Store each piece separately in an airtight pouch. Put jewellery on last and take it off first."}
}', true),
('notifications', '{"owner_email":"","owner_whatsapp":"","owner_email_enabled":true,"owner_whatsapp_enabled":false,"customer_email_enabled":true,"customer_whatsapp_enabled":true}', false)
on conflict (key) do nothing;

insert into public.categories (name, slug, sort_order, is_featured, image_url) values
('Earrings','earrings',1,true,'/demo/studs.jpg'),('Jhumkas','jhumkas',2,true,'/demo/jhumka.jpg'),('Studs','studs',3,false,null),
('Baliyan','baliyan',4,false,null),('Rings','rings',5,true,'/demo/rings.jpg'),('Bangles','bangles',6,false,null),
('Bracelets','bracelets',7,true,'/demo/bracelet.jpg'),('Pendants','pendants',8,false,null),('Chains','chains',9,false,'/demo/chain.jpg'),
('Mangalsutra','mangalsutra',10,false,null),('Necklaces','necklaces',11,true,'/demo/necklace.jpg'),('Jewellery Sets','jewellery-sets',12,true,'/demo/set.jpg'),
('Festive','festive',13,false,null),('Daily Wear','daily-wear',14,false,null),('Office Wear','office-wear',15,false,null),
('Anti-Tarnish','anti-tarnish',16,false,null)
on conflict (slug) do nothing;
update public.categories set parent_id = (select id from public.categories where slug = 'earrings') where slug in ('jhumkas','studs','baliyan') and parent_id is null;

insert into public.homepage_content (section_key, label, title, subtitle, body, image_url, cta_label, cta_url, sort_order) values
('hero','Hero banner',null,null,null,null,null,null,1),
('categories','Featured categories','Shop by Category','Find the piece that feels like you',null,null,null,null,2),
('new_arrivals','New arrivals','New Arrivals','Freshly crafted, just landed',null,null,'View all','/shop?sort=newest',3),
('offer','Coupon / offer','Festive Offer','Use code at checkout',null,null,'Shop the offer','/shop',4),
('bestsellers','Bestsellers','Bestsellers','Loved and re-ordered',null,null,'View all','/shop?sort=popular',5),
('promo','Promotional banners',null,null,null,null,null,null,6),
('trending','Trending','Trending Now','What everyone is wearing this week',null,null,null,null,7),
('festive','Festive collection','The Festive Edit','Statement pieces for celebrations',null,null,'Explore','/shop?collection=festive',8),
('recently_viewed','Recently viewed','Recently Viewed',null,null,null,null,null,9),
('testimonials','Customer reviews','From Our Customers',null,null,null,null,null,10),
('story','Brand story','Wear elegance. Share Kindness','Our story','[Your brand story — a few lines on how IMINATIONZ began and the women it is made for.]','/demo/story.jpg','Read our story','/pages/about',11),
('care','Jewellery care','Caring for your jewellery',null,'Keep away from water and perfume · Wipe with a soft cloth · Store in an airtight pouch',null,'Care guide','/pages/care',12),
('newsletter','Newsletter','Join the IMINATIONZ circle','New launches and offers, a few times a month. Unsubscribe anytime.',null,null,null,null,13)
on conflict (section_key) do nothing;

insert into public.banners (placement, title, subtitle, image_url, cta_label, cta_url, sort_order)
select 'hero','Jewellery that carries your story','Premium imitation and anti-tarnish pieces, designed in India for every day and every celebration.','/demo/hero.jpg','Shop the collection','/shop',1
where not exists (select 1 from public.banners);
insert into public.banners (placement, title, subtitle, image_url, cta_label, cta_url, sort_order)
select 'promo','The Anti-Tarnish Edit','Everyday shine that lasts','/demo/chain.jpg','Shop now','/shop?collection=anti-tarnish',1
where not exists (select 1 from public.banners where placement = 'promo');

-- DEMO products (clearly marked; prices/stock are placeholders)
with d(name, slug, sku, cat, price, sale, stock, img, anti, feat, new_, best, trend, fest) as (values
 ('[DEMO] Kundan Pearl Jhumka','demo-kundan-pearl-jhumka','DEMO-JH-001','jhumkas',1299,899,5,'/demo/jhumka.jpg',false,true,true,true,false,true),
 ('[DEMO] Minimal Gold Studs','demo-minimal-gold-studs','DEMO-ST-001','studs',599,null,12,'/demo/studs.jpg',true,false,true,false,true,false),
 ('[DEMO] Stackable Ring Trio','demo-stackable-ring-trio','DEMO-RG-001','rings',799,649,8,'/demo/rings.jpg',true,true,false,true,true,false),
 ('[DEMO] Coin Charm Chain','demo-coin-charm-chain','DEMO-CH-001','chains',999,null,2,'/demo/chain.jpg',true,false,true,false,true,false),
 ('[DEMO] Twisted Cuff Bracelet','demo-twisted-cuff-bracelet','DEMO-BR-001','bracelets',1099,949,6,'/demo/bracelet.jpg',true,true,false,true,false,false),
 ('[DEMO] Layered Festive Necklace','demo-layered-festive-necklace','DEMO-NK-001','necklaces',1899,1499,4,'/demo/necklace.jpg',false,true,true,false,true,true),
 ('[DEMO] Everyday Jewellery Set','demo-everyday-jewellery-set','DEMO-SET-001','jewellery-sets',2199,1799,0,'/demo/set.jpg',false,false,false,true,false,true)
)
insert into public.products (name, slug, sku, category_id, description, price, sale_price, stock, status, is_anti_tarnish, anti_tarnish_info,
  is_featured, is_new, is_bestseller, is_trending, is_festive, material, finish, care_instructions, is_demo, tags)
select d.name, d.slug, d.sku, c.id, 'Demo product for testing the store. Replace with your real product description, photos, price and stock.',
  d.price, d.sale, d.stock, 'published', d.anti, case when d.anti then '[Confirm before launch] Anti-tarnish coating — confirm wear period with your supplier.' end,
  d.feat, d.new_, d.best, d.trend, d.fest, 'Brass alloy', 'Gold plated', 'Keep away from water and perfume. Store in a pouch.', true, array['demo']
from d join public.categories c on c.slug = d.cat
on conflict (slug) do nothing;

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select p.id, '/demo/' || case p.sku when 'DEMO-JH-001' then 'jhumka' when 'DEMO-ST-001' then 'studs' when 'DEMO-RG-001' then 'rings'
  when 'DEMO-CH-001' then 'chain' when 'DEMO-BR-001' then 'bracelet' when 'DEMO-NK-001' then 'necklace' else 'set' end || '.jpg', p.name, 0, true
from public.products p where p.is_demo and not exists (select 1 from public.product_images i where i.product_id = p.id);

insert into public.product_variants (product_id, name, sku, stock, sort_order)
select p.id, v.name, v.sku, v.stock, v.ord from public.products p
join (values ('Size 6','DEMO-RG-001-6',3,1),('Size 7','DEMO-RG-001-7',3,2),('Size 8','DEMO-RG-001-8',2,3)) v(name, sku, stock, ord) on p.sku = 'DEMO-RG-001'
on conflict (sku) do nothing;
