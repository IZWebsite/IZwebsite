-- IMINATIONZ schema: tables, indexes, RLS, storage
create extension if not exists pgcrypto;

do $$ begin
  create type public.staff_role as enum ('owner','manager','inventory','fulfilment','analyst');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  whatsapp_opt_in boolean not null default false,
  marketing_opt_in boolean not null default false,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.staff_role not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Permission model (enforced in RLS and RPCs)
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case r.role
      when 'owner' then true
      when 'manager' then p in ('view','products','orders','refunds','content','coupons','customers')
      when 'inventory' then p in ('view','products')
      when 'fulfilment' then p in ('view','orders')
      when 'analyst' then p in ('view')
    end
    from public.user_roles r where r.user_id = auth.uid()
  ), false);
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.user_roles where user_id = auth.uid();
$$;

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  country text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.categories(id) on delete set null,
  description text,
  image_url text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sku text not null unique,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  specifications jsonb not null default '{}'::jsonb,
  material text, finish text, colour text, size text, dimensions text, weight text,
  care_instructions text,
  is_anti_tarnish boolean not null default false,
  anti_tarnish_info text,
  price numeric(10,2) not null check (price >= 0),
  sale_price numeric(10,2) check (sale_price is null or (sale_price >= 0 and sale_price <= price)),
  stock int not null default 0 check (stock >= 0),
  reserved int not null default 0 check (reserved >= 0),
  low_stock_threshold int not null default 3,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_featured boolean not null default false,
  is_new boolean not null default false,
  is_bestseller boolean not null default false,
  is_trending boolean not null default false,
  is_festive boolean not null default false,
  tags text[] not null default '{}',
  seo_title text, seo_description text,
  view_count int not null default 0,
  sold_count int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved <= stock)
);
create index if not exists products_status_idx on public.products(status, created_at desc);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_name_idx on public.products(lower(name));

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images(product_id, sort_order);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text not null unique,
  price numeric(10,2) check (price is null or price >= 0),
  sale_price numeric(10,2) check (sale_price is null or sale_price >= 0),
  stock int not null default 0 check (stock >= 0),
  reserved int not null default 0 check (reserved >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (reserved <= stock)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  change int not null,
  stock_after int,
  reason text not null,
  reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  quantity int not null check (quantity > 0 and quantity <= 20),
  updated_at timestamptz not null default now()
);
create unique index if not exists cart_items_unique on public.cart_items(user_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  description text,
  discount_type text not null check (discount_type in ('percent','fixed','free_shipping')),
  value numeric(10,2) not null default 0 check (value >= 0),
  min_cart_value numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit int,
  per_customer_limit int,
  used_count int not null default 0,
  product_ids uuid[] not null default '{}',
  category_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  show_on_site boolean not null default false,
  created_at timestamptz not null default now()
);

create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  access_token uuid not null default gen_random_uuid(),
  idempotency_key uuid unique,
  customer_name text not null,
  email text not null,
  phone text not null,
  shipping_address jsonb not null,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  shipping_fee numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  tax_inclusive boolean not null default true,
  total numeric(10,2) not null,
  refunded_amount numeric(10,2) not null default 0,
  coupon_code text,
  payment_method text not null check (payment_method in ('cod','razorpay')),
  payment_status text not null default 'pending' check (payment_status in ('pending','cod_pending','paid','failed','refunded','partially_refunded')),
  status text not null check (status in ('pending_payment','confirmed','processing','ready_to_ship','shipped','out_for_delivery','delivered','cancellation_requested','cancelled','return_requested','return_approved','returned','refund_initiated','refunded','payment_failed')),
  stock_committed boolean not null default false,
  reservation_expires_at timestamptz,
  courier_name text, tracking_number text, tracking_url text,
  customer_note text,
  whatsapp_opt_in boolean not null default false,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz, shipped_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_email_idx on public.orders(lower(email));
create index if not exists orders_phone_idx on public.orders(phone);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  sku text not null,
  image_url text,
  unit_price numeric(10,2) not null,
  quantity int not null check (quantity > 0),
  line_total numeric(10,2) not null
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

-- order items are immutable price snapshots
create or replace function public.prevent_order_item_update() returns trigger language plpgsql as $$
begin raise exception 'order_items are immutable'; end $$;
drop trigger if exists order_items_immutable on public.order_items;
create trigger order_items_immutable before update on public.order_items for each row execute function public.prevent_order_item_update();

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text, to_status text not null,
  note text, changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history(order_id, created_at);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','authorized','captured','failed','refunded')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_order_idx on public.payment_transactions(order_id);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  quantity int not null check (quantity > 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','committed','released')),
  created_at timestamptz not null default now()
);
create index if not exists inventory_reservations_active_idx on public.inventory_reservations(status, expires_at);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid,
  email text not null,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions(coupon_id, lower(email));

create table if not exists public.shipping_updates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  message text,
  courier_name text, tracking_number text, tracking_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.returns_and_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid,
  type text not null check (type in ('cancellation','return','refund')),
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','rejected','completed')),
  amount numeric(10,2),
  provider_refund_id text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  rating int not null check (rating between 1 and 5),
  title text, body text,
  is_verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create table if not exists public.homepage_content (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  label text not null,
  title text, subtitle text, body text, image_url text,
  cta_label text, cta_url text,
  config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null default 'hero' check (placement in ('hero','promo')),
  title text, subtitle text, image_url text,
  cta_label text, cta_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_key text not null,
  data jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists content_revisions_idx on public.content_revisions(entity, entity_key, created_at desc);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','whatsapp')),
  audience text not null check (audience in ('customer','owner')),
  recipient text,
  event text not null,
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notification_logs_pending_idx on public.notification_logs(status, next_attempt_at);

create table if not exists public.analytics_events (
  id bigserial primary key,
  event_id uuid not null unique,
  event_type text not null check (event_type in ('page_view','product_view','search','add_to_cart','checkout_start','order_placed')),
  visitor_id text not null,
  session_id text,
  path text,
  product_id uuid references public.products(id) on delete set null,
  category_slug text,
  search_query text,
  referrer text,
  utm_source text, utm_medium text, utm_campaign text,
  device text,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_type_time_idx on public.analytics_events(event_type, created_at desc);
create index if not exists analytics_events_time_idx on public.analytics_events(created_at desc);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_time_idx on public.admin_audit_logs(created_at desc);

create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  consent boolean not null check (consent),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create table if not exists public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('order','customer')),
  entity_id uuid not null,
  note text not null check (length(note) between 1 and 2000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists staff_notes_idx on public.staff_notes(entity, entity_id, created_at desc);

-- ============ RLS ============
do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','addresses','categories','products','product_images','product_variants','inventory_movements','cart_items','wishlists','coupons','orders','order_items','order_status_history','payment_transactions','payment_webhook_events','inventory_reservations','coupon_redemptions','shipping_updates','returns_and_refunds','product_reviews','homepage_content','banners','store_settings','content_revisions','notification_logs','analytics_events','admin_audit_logs','newsletter_subscriptions','staff_notes']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- helper to (re)create policies idempotently
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_self on public.profiles for select using (id = auth.uid() or public.has_perm('customers'));
create policy profiles_self_ins on public.profiles for insert with check (id = auth.uid());
create policy profiles_self_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff_upd on public.profiles for update using (public.has_perm('customers'));

create policy roles_read on public.user_roles for select using (user_id = auth.uid() or public.has_perm('staff'));

create policy addresses_own on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_staff on public.addresses for select using (public.has_perm('customers'));

create policy categories_public on public.categories for select using (is_visible or public.has_perm('view'));
create policy categories_write on public.categories for all using (public.has_perm('products')) with check (public.has_perm('products'));

create policy products_public on public.products for select using (status = 'published' or public.has_perm('view'));
create policy products_write on public.products for all using (public.has_perm('products')) with check (public.has_perm('products'));

create policy images_public on public.product_images for select using (exists (select 1 from public.products p where p.id = product_id and (p.status='published' or public.has_perm('view'))));
create policy images_write on public.product_images for all using (public.has_perm('products')) with check (public.has_perm('products'));

create policy variants_public on public.product_variants for select using (exists (select 1 from public.products p where p.id = product_id and (p.status='published' or public.has_perm('view'))));
create policy variants_write on public.product_variants for all using (public.has_perm('products')) with check (public.has_perm('products'));

create policy movements_staff on public.inventory_movements for select using (public.has_perm('view'));

create policy cart_own on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wishlist_own on public.wishlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy coupons_staff on public.coupons for select using (public.has_perm('coupons') or public.has_perm('view'));
create policy coupons_write on public.coupons for all using (public.has_perm('coupons')) with check (public.has_perm('coupons'));

create policy orders_own on public.orders for select using (user_id = auth.uid() or public.has_perm('orders') or public.has_perm('customers'));
create policy order_items_own on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_perm('orders') or public.has_perm('customers'))));
create policy history_own on public.order_status_history for select using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_perm('orders'))));
create policy shipping_own on public.shipping_updates for select using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_perm('orders'))));
create policy rr_own on public.returns_and_refunds for select using (user_id = auth.uid() or public.has_perm('orders'));
create policy payments_staff on public.payment_transactions for select using (public.has_perm('orders'));
create policy webhooks_staff on public.payment_webhook_events for select using (public.has_perm('settings'));
create policy reservations_staff on public.inventory_reservations for select using (public.has_perm('view'));
create policy redemptions_staff on public.coupon_redemptions for select using (public.has_perm('coupons'));

create policy reviews_public on public.product_reviews for select using (status = 'approved' or user_id = auth.uid() or public.has_perm('content'));
create policy reviews_moderate on public.product_reviews for update using (public.has_perm('content'));
create policy reviews_delete on public.product_reviews for delete using (public.has_perm('content') or user_id = auth.uid());

create policy homepage_public on public.homepage_content for select using (is_visible or public.has_perm('content'));
create policy homepage_write on public.homepage_content for all using (public.has_perm('content')) with check (public.has_perm('content'));
create policy banners_public on public.banners for select using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.has_perm('content'));
create policy banners_write on public.banners for all using (public.has_perm('content')) with check (public.has_perm('content'));

create policy settings_public on public.store_settings for select using (is_public or public.has_perm('settings'));
create policy settings_content_write on public.store_settings for update using (public.has_perm('settings') or (public.has_perm('content') and key in ('brand','announcement','pages','footer','seo','faq','contact'))) with check (public.has_perm('settings') or (public.has_perm('content') and key in ('brand','announcement','pages','footer','seo','faq','contact')));
create policy settings_insert on public.store_settings for insert with check (public.has_perm('settings'));

create policy revisions_staff on public.content_revisions for select using (public.has_perm('content'));
create policy notifications_staff on public.notification_logs for select using (public.has_perm('settings') or public.has_perm('orders'));
create policy analytics_staff on public.analytics_events for select using (public.has_perm('view'));
create policy audit_staff on public.admin_audit_logs for select using (public.has_perm('settings'));
create policy staff_notes_read on public.staff_notes for select using ((entity = 'order' and public.has_perm('orders')) or (entity = 'customer' and public.has_perm('customers')));
create policy staff_notes_add on public.staff_notes for insert with check (created_by = auth.uid() and ((entity = 'order' and public.has_perm('orders')) or (entity = 'customer' and public.has_perm('customers'))));
create policy newsletter_staff on public.newsletter_subscriptions for select using (public.has_perm('customers'));

-- ============ Storage ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif','image/x-icon','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists store_media_read on storage.objects;
drop policy if exists store_media_write on storage.objects;
drop policy if exists store_media_update on storage.objects;
drop policy if exists store_media_delete on storage.objects;
create policy store_media_read on storage.objects for select using (bucket_id = 'store-media');
create policy store_media_write on storage.objects for insert with check (bucket_id = 'store-media' and (public.has_perm('products') or public.has_perm('content')));
create policy store_media_update on storage.objects for update using (bucket_id = 'store-media' and (public.has_perm('products') or public.has_perm('content')));
create policy store_media_delete on storage.objects for delete using (bucket_id = 'store-media' and (public.has_perm('products') or public.has_perm('content')));
