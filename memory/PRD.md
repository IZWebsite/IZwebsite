# IMINATIONZ — PRD

## Original problem statement
"MASTER PROJECT PROMPT — IMINATIONZ PREMIUM JEWELLERY E-COMMERCE PLATFORM": a complete, production-oriented full-stack e-commerce site for an Indian women's imitation and anti-tarnish jewellery brand. It covers the storefront, customer accounts, cart and checkout with concurrency-safe inventory, Razorpay, Resend email, WhatsApp Cloud API, first-party analytics, a full mobile-friendly admin with RBAC, a Supabase schema with RLS, Netlify deployment, tests and docs. Tagline: "Wear elegance. Share Kindness". The full brief is in the first chat message.

User choices: Supabase + Netlify; Razorpay ready for test keys (online payment off until keys are added); Resend with the user's own account (key not provided yet); WhatsApp built but switched off until credentials are added. The user will run the SQL themselves.

## Architecture
- Frontend: React (CRA, JS), Tailwind, shadcn. supabase-js uses the anon key only.
- Supabase Postgres holds all business logic as SECURITY DEFINER RPCs: `_quote`, `quote_cart`, `place_order`, `confirm_payment`, `fail_payment`, `release_expired_reservations`, `admin_update_order`, `customer_cancel_order`, `customer_request_return`, `get_order`, `track_order`, `admin_dashboard`, `admin_traffic`, `admin_customers`, `admin_set_role`, `admin_bulk_update`, `mark_refunded`, `track_event`, `submit_review`. RLS is on for every table; `has_perm()` defines the role permissions.
- Netlify Functions: razorpay-create-order, razorpay-verify, razorpay-webhook, admin-refund, process-notifications, scheduled-maintenance (every 5 min), integration-status, seo (sitemap and robots).
- Storage bucket: `store-media` (5 MB limit, image types only, staff write).

## Implemented (2026-10-21)
- Storefront: home (admin-ordered sections), shop (search, filters, sort, pagination), product page (gallery, variants, PIN check, reviews, JSON-LD), cart with server quote and coupons, checkout (COD/Razorpay, idempotent), order page (guest token, cancel/return), track order, account (orders, wishlist, addresses, profile, data export, deletion request), auth (register with email verification, login, magic link, reset), info pages, 404, consent banner, WhatsApp button.
- Admin: overview metrics and charts, traffic analytics with a "live" estimate, orders (filters, CSV, detail, transitions, tracking, notes, invoice print, Razorpay refund), products (bulk edit, CSV import/export, editor with images, variants and movement history), categories, coupons, review moderation, content CMS (banners, sections, brand/logo, pages, FAQ, SEO, contact) with version restore, customers (detail, notes, owner delete), settings (payments, shipping, tax, policies, notifications, analytics, maintenance, integration health, notification log, staff roles, audit log).
- Tests: 15 pytest DB tests (oversell concurrency, reservations, payment idempotency, coupons, transitions, RLS isolation, self-grant blocked) and 5 Node function tests. All pass on a local Postgres. `yarn build` passes.

## Update (2026-10-21, iteration 2)
- The user ran the schema and logic SQL on the live project and skipped the starter data. The user is already owner: logo, contact and announcement were saved through the admin.
- Added the owner-only "Set up store defaults" button (Admin → Overview). It creates the missing settings, homepage sections and categories without demo products.
- Home page now falls back to default sections and hero. The footer, contact and FAQ pages handle empty settings. The announcement bar opens external links correctly.
- Testing agent iteration_1: all 13 storefront flows pass at 1920px and 390px. No accounts or orders were created on the live DB.

## Update (2026-10-21, iteration 3): psychothreads-style layout in IMINATIONZ colours
- Header: nav on the left, logo centred, icons on the right. Full-width hero with a pill CTA; an empty heading means image-only (for banners with text baked in). Dark scrolling offer strip, large rounded category tiles with pill labels, a 4-icon trust row, eyebrow + title + solid "View all" headings, offer band with sale items, tabbed collections, mobile bottom nav, gold back-to-top button.
- New homepage section keys (marquee, features, tabs) show automatically for existing stores. The owner's "Set up store defaults" saves them so they become editable.
- Floating buttons stay hidden until the consent banner is answered.

## Update (2026-10-21): sample content + category row
- Admin → Website content: "Load sample content" adds any missing homepage sections (marquee, features, tabs), fills only empty section text, makes sections visible, and adds 8 [SAMPLE] products (is_demo=true, /demo images) mapped to existing categories. "Remove sample products" deletes is_demo products.
- Testimonials fall back to section Body lines "Name | quote" when there are no approved reviews.
- Homepage categories: one horizontally scrollable row (all featured, or all visible if none featured).
- Root cause of hidden sections: no published products/reviews in the DB, and marquee/features/tabs rows were missing from homepage_content.
- The loader is NOT tested against the real DB (it would write to customer data).

## Pending / Backlog
- P0: The user must run `supabase/setup_all.sql` in the Supabase SQL Editor and create the owner role (README). After that, run end-to-end UI testing on the live Supabase project.
- P0: Add Netlify env vars (service role, Razorpay test keys, webhook secret, Resend), deploy, and verify.
- P1: WhatsApp template approval and credentials; Supabase SMTP via Resend; replace DEMO products; review the policy text, GSTIN and tax.
- P2: Phone OTP (needs an SMS provider); conversion to TypeScript/Vite if desired; image cropping UI.
