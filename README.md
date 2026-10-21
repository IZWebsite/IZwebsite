# IMINATIONZ — Premium Jewellery E-commerce

*Wear elegance. Share Kindness.*

A full online store with an admin dashboard. It uses **React** for the storefront and admin, **Supabase** (PostgreSQL, Auth, Storage, RLS) for data and business logic, and **Netlify** (hosting plus serverless functions) for payments, notifications, sitemap and scheduled jobs.

```
frontend/                 React app (CRA + Tailwind + shadcn/ui)
  src/pages               storefront: home, shop, product, cart, checkout, order, account, auth, info pages
  src/admin               admin: overview, orders, products, categories/coupons/reviews, content, customers, traffic, settings
  netlify/functions       server-side: Razorpay create/verify/webhook/refund, notifications queue, scheduled job, sitemap/robots
  netlify/tests           Node tests for signature verification + notification failure handling
supabase/migrations       0001 schema + RLS + storage, 0002 business logic (RPCs/triggers), 0003 settings + DEMO data
supabase/tests            local PostgreSQL test harness + pytest business-logic tests
netlify.toml              build, SPA fallback, redirects, security headers, schedule
```

## How the key business rules work
- **Prices, coupons, shipping and GST are calculated only on the server.** `quote_cart` and `place_order` in Postgres share one pricing function, `_quote`. The browser shows estimates only.
- **Inventory is concurrency-safe.** `place_order` locks the product and variant rows (`SELECT … FOR UPDATE`, always in the same order) inside one transaction. CHECK constraints (`stock >= 0`, `reserved <= stock`) are a second safety net. The tests run 12 buyers in parallel against 5 units, and exactly 5 succeed.
- **COD policy:** stock is deducted as soon as the COD order is placed (status *Order confirmed*). If the order is cancelled or returned, the stock is restored automatically.
- **Online payments:** placing an online order holds the stock for `reservation_minutes` (default 15). The order only becomes *Paid* after two checks: the server verifies the Razorpay signature, and it fetches the payment from the Razorpay API. A webhook gives a second, idempotent confirmation path. Duplicate events are rejected by a unique `event_id`, and `confirm_payment` returns `already_paid` when called again. Expired holds are released every 5 minutes by `scheduled-maintenance`. A failed payment attempt is only logged, so the customer can retry until the hold expires.
- **Order status changes are validated.** The allowed transitions live in `_transitions()`. Every change is written to `order_status_history`, and admin actions go to `admin_audit_logs`.
- **Notifications go through a queue.** They are written to `notification_logs` in the same transaction as the order. Netlify functions then send them through Resend (email) and the WhatsApp Cloud API, with up to 5 retries and exponential backoff. If sending keeps failing, the owner is alerted. A provider outage never blocks an order.

## Roles (set server-side in `has_perm()`; never granted on sign-up)
| Role | Permissions |
|---|---|
| owner | everything, including staff, settings, integrations and refunds |
| manager | view, products, orders, refunds, content, coupons, customers |
| inventory | view, products |
| fulfilment | view, orders |
| analyst | view (dashboards only) |

## 1. Supabase setup
1. Supabase → **SQL Editor**. Paste and run, in this order: `supabase/migrations/0001_schema.sql`, then `0002_logic.sql`, then `0003_seed.sql`.
2. Authentication → URL configuration: set **Site URL** to your domain. Add `https://YOUR-SITE.netlify.app/**` and `https://www.yourdomain.com/**` to the redirect URLs.
3. Authentication → Providers → Email: keep **Confirm email** ON.
4. Authentication → SMTP: connect Resend SMTP (`smtp.resend.com`, port 465, user `resend`, password = your Resend API key). Supabase's built-in mailer is rate-limited and is only suitable for testing.
5. Optional: Authentication → Email templates. Brand the verification and reset emails.

### Create the first owner account (no public admin sign-up exists)
1. Register on the website at `/register` with your own email, then verify it.
2. In the SQL Editor, run:
```sql
insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'YOUR-EMAIL@example.com';
```
3. Log in and open `/admin`. Add more staff from **Settings → Staff & permissions**. Each person must register first.

## 2. Netlify deployment
1. Push this repository to GitHub (use Emergent's **Save to GitHub** button). On Netlify, choose **Add new site → Import from Git** and pick the repo. `netlify.toml` already sets base `frontend`, command `yarn build`, publish `build` and functions `netlify/functions`.
2. Site settings → **Environment variables**. Add every variable listed in `frontend/.env.example`:
   - Public: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_FUNCTIONS_BASE=/.netlify/functions`
   - Secret, server only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_DEFAULT`, `WHATSAPP_TEMPLATE_LANG`
3. Deploy. Deploy previews work automatically for pull requests; add the preview URL pattern to the Supabase redirect URLs.
4. Custom domain: Netlify → Domain management → Add domain. Point DNS as instructed. HTTPS is issued automatically by Let's Encrypt.

## 3. Razorpay
1. Razorpay Dashboard → Settings → API Keys. Generate **test** keys and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on Netlify.
2. Settings → Webhooks → Add webhook:
   - URL: `https://YOUR-DOMAIN/.netlify/functions/razorpay-webhook`
   - Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`
3. In the store admin, go to **Settings → Integration health** and confirm Razorpay shows as configured. Then turn on **Payments → Online payment enabled**.
4. Test with Razorpay's test cards or UPI (`success@razorpay`). Switch to `rzp_live_…` keys only after KYC and activation.

## 4. Email (Resend)
Verify your domain in Resend (SPF/DKIM DNS records). Then set `RESEND_API_KEY` and `EMAIL_FROM` (for example `IMINATIONZ <orders@yourdomain.com>`). Set the owner alert email in **Settings → Notifications**.

## 5. WhatsApp (official Cloud API)
1. Meta Business → WhatsApp → set up a business phone number. Get a permanent token (`WHATSAPP_TOKEN`) and the phone number ID (`WHATSAPP_PHONE_NUMBER_ID`).
2. Create a **utility** template and get it approved, for example `order_update` with body: `Hi {{1}}, your IMINATIONZ order {{2}}: {{3}}.`
3. Set `WHATSAPP_TEMPLATE_DEFAULT=order_update`. You can also use a different template per event with `WHATSAPP_TEMPLATE_SHIPPED`, `WHATSAPP_TEMPLATE_ORDER_CONFIRMED`, and so on.
4. Messages go only to customers who ticked WhatsApp consent. The floating chat button is a separate `wa.me` link (Admin → Website content → Contact).

## Tests
```bash
# Database business logic: concurrency, reservations, payments idempotency, coupons, transitions, RLS isolation
apt-get install -y postgresql && service postgresql start
bash supabase/tests/apply_local.sh
TEST_DSN="dbname=imz_test user=postgres password=... host=localhost" python3 -m pytest -q supabase/tests
# Serverless functions: signature verification, webhook rejection, provider-failure retries
cd frontend && node --test netlify/tests
# Production build
cd frontend && yarn build
```
Tests never touch the live Supabase project.

## Backups
- Supabase Pro includes daily backups. On the free plan, export regularly with `pg_dump "postgresql://postgres:PASSWORD@db.YOUR-REF.supabase.co:5432/postgres" > backup.sql`, plus the CSV exports in the admin (orders and products).
- Images live in the Storage bucket `store-media`.

## Costs and limits (check current pricing)
- Supabase free plan: 500 MB database, 1 GB storage, 50k monthly active users. Projects pause after a week of inactivity, so use Pro (about US$25/month) for a live store.
- Netlify free plan: limited bandwidth, build minutes and function invocations each month.
- Razorpay: about 2% per transaction (more for some methods).
- Resend free plan: 3,000 emails/month.
- WhatsApp: Meta charges per conversation/template message.

## Launch checklist
- [ ] Run the migrations. Create the owner. Delete DEMO products (`delete from products where is_demo;`).
- [ ] Add real products, photos, prices and stock. Upload the logo and favicon (Admin → Website content).
- [ ] Review **all policy pages**: privacy, terms, shipping, returns, cancellation. Fill in contact details, address and GSTIN. Ideally have them checked by a professional.
- [ ] Confirm the GST mode and rate with your accountant (Settings → Tax).
- [ ] Add the Netlify env vars. Check Integration health shows everything configured.
- [ ] Place a Razorpay test order end to end. Check the webhook deliveries in the Razorpay dashboard.
- [ ] Set up Supabase SMTP with Resend. Test sign-up verification and password reset.
- [ ] Get the WhatsApp template approved and send a test.
- [ ] Set up the custom domain and HTTPS. Set `SITE_URL`. Submit `/sitemap.xml` in Google Search Console.
- [ ] Switch Razorpay to live keys.
