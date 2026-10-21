-- IMINATIONZ business logic: triggers, pricing, orders, inventory, payments, admin RPCs

create or replace function public._setting(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.store_settings where key = k), '{}'::jsonb);
$$;

-- ---------- generic triggers ----------
create or replace function public._touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public._touch();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public._touch();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, whatsapp_opt_in, marketing_opt_in)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone',
          coalesce((new.raw_user_meta_data->>'whatsapp_opt_in')::boolean, false),
          coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public._audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.admin_audit_logs (actor_id, action, entity, entity_id, details)
    values (auth.uid(), lower(tg_op), tg_table_name,
      coalesce(case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id',
               case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'key',
               case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'user_id'),
      case when tg_op = 'DELETE' then jsonb_build_object('name', to_jsonb(old)->>'name') else '{}'::jsonb end);
  end if;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['products','product_variants','categories','coupons','store_settings','homepage_content','banners','user_roles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public._audit()', t || '_audit', t);
  end loop;
end $$;

create or replace function public._revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.content_revisions (entity, entity_key, data, created_by)
  values (tg_table_name, coalesce(to_jsonb(old)->>'key', to_jsonb(old)->>'section_key'), to_jsonb(old), auth.uid());
  return new;
end $$;
drop trigger if exists store_settings_rev on public.store_settings;
create trigger store_settings_rev before update on public.store_settings for each row execute function public._revision();
drop trigger if exists homepage_content_rev on public.homepage_content;
create trigger homepage_content_rev before update on public.homepage_content for each row execute function public._revision();

-- ---------- notifications queue ----------
create or replace function public._notify_owner(p_event text, p_order uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n jsonb := public._setting('notifications');
begin
  if coalesce((n->>'owner_email_enabled')::boolean, true) and coalesce(n->>'owner_email','') <> '' then
    insert into public.notification_logs (channel, audience, recipient, event, order_id, payload)
    values ('email','owner', n->>'owner_email', p_event, p_order, p_payload);
  end if;
  if coalesce((n->>'owner_whatsapp_enabled')::boolean, false) and coalesce(n->>'owner_whatsapp','') <> '' then
    insert into public.notification_logs (channel, audience, recipient, event, order_id, payload)
    values ('whatsapp','owner', n->>'owner_whatsapp', p_event, p_order, p_payload);
  end if;
end $$;

create or replace function public._notify(p_order uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; n jsonb := public._setting('notifications');
begin
  select * into o from public.orders where id = p_order;
  if not found then return; end if;
  if p_event in ('order_confirmed','payment_failed','processing','ready_to_ship','shipped','out_for_delivery','delivered','cancelled','return_approved','refund_initiated','refunded')
     and coalesce((n->>'customer_email_enabled')::boolean, true) then
    insert into public.notification_logs (channel, audience, recipient, event, order_id)
    values ('email','customer', o.email, p_event, o.id);
  end if;
  if p_event in ('order_confirmed','ready_to_ship','shipped','cancelled','refunded')
     and o.whatsapp_opt_in and coalesce((n->>'customer_whatsapp_enabled')::boolean, true) then
    insert into public.notification_logs (channel, audience, recipient, event, order_id)
    values ('whatsapp','customer', o.phone, p_event, o.id);
  end if;
  if p_event in ('new_order','payment_failed','cancelled','cancellation_requested','return_requested','refund_required') then
    perform public._notify_owner(case when p_event = 'cancelled' then 'order_cancelled' else p_event end, o.id,
      jsonb_build_object('order_number', o.order_number, 'total', o.total));
  end if;
end $$;

-- ---------- stock movement + low stock trigger ----------
create or replace function public._stock_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_variant boolean := tg_table_name = 'product_variants';
  pid uuid := case when is_variant then (to_jsonb(new)->>'product_id')::uuid else new.id end;
  thr int; pname text; old_av int := old.stock - old.reserved; new_av int := new.stock - new.reserved;
begin
  if new.stock <> old.stock then
    insert into public.inventory_movements (product_id, variant_id, change, stock_after, reason, reference, created_by)
    values (pid, case when is_variant then new.id end, new.stock - old.stock, new.stock,
            coalesce(nullif(current_setting('app.stock_reason', true), ''), 'manual_adjustment'),
            nullif(current_setting('app.stock_ref', true), ''), auth.uid());
  end if;
  select low_stock_threshold, name into thr, pname from public.products where id = pid;
  if new_av <= 0 and old_av > 0 then
    perform public._notify_owner('out_of_stock', null, jsonb_build_object('product', pname, 'sku', new.sku));
  elsif new_av <= thr and old_av > thr then
    perform public._notify_owner('low_stock', null, jsonb_build_object('product', pname, 'sku', new.sku, 'available', new_av));
  end if;
  return new;
end $$;
drop trigger if exists products_stock on public.products;
create trigger products_stock after update of stock, reserved on public.products for each row execute function public._stock_trigger();
drop trigger if exists variants_stock on public.product_variants;
create trigger variants_stock after update of stock, reserved on public.product_variants for each row execute function public._stock_trigger();

-- ---------- catalogue view ----------
create or replace view public.catalog with (security_invoker = true) as
select p.id, p.name, p.slug, p.sku, p.category_id, p.description, p.price, p.sale_price, p.stock, p.reserved,
  coalesce(p.sale_price, p.price) as effective_price,
  case when p.sale_price is not null and p.price > 0 then round((1 - p.sale_price / p.price) * 100) else 0 end as discount_pct,
  p.status, p.is_featured, p.is_new, p.is_bestseller, p.is_trending, p.is_festive, p.is_anti_tarnish, p.tags,
  p.low_stock_threshold, p.view_count, p.sold_count, p.created_at, p.is_demo,
  v.variant_count,
  case when v.variant_count > 0 then v.variant_available else p.stock - p.reserved end as available,
  (select i.url from public.product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order limit 1) as image_url,
  (select i.url from public.product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order offset 1 limit 1) as hover_image_url,
  c.slug as category_slug, c.name as category_name
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (select count(*)::int as variant_count, coalesce(sum(pv.stock - pv.reserved), 0)::int as variant_available
                   from public.product_variants pv where pv.product_id = p.id and pv.is_active) v on true;
grant select on public.catalog to anon, authenticated;

-- ---------- pricing (single source of truth) ----------
create or replace function public._quote(p_items jsonb, p_coupon text, p_email text, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it record; p public.products; v public.product_variants; avail int; unit numeric; vcount int;
  lines jsonb := '[]'; errors jsonb := '[]'; subtotal numeric := 0; eligible numeric := 0;
  c public.coupons; coupon_error text; discount numeric := 0; free_ship boolean := false;
  ship jsonb := public._setting('shipping'); tx jsonb := public._setting('tax');
  shipping numeric := 0; tax numeric := 0; total numeric; rate numeric; used int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('lines', lines, 'errors', jsonb_build_array(jsonb_build_object('message','Cart is empty')), 'subtotal',0,'discount',0,'shipping',0,'tax',0,'total',0);
  end if;
  for it in select * from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity int) loop
    select * into p from public.products where id = it.product_id;
    if not found or p.status <> 'published' then
      errors := errors || jsonb_build_object('product_id', it.product_id, 'message', 'This item is no longer available'); continue;
    end if;
    if it.quantity is null or it.quantity < 1 or it.quantity > 20 then
      errors := errors || jsonb_build_object('product_id', p.id, 'message', 'Invalid quantity for ' || p.name); continue;
    end if;
    v := null;
    if it.variant_id is not null then
      select * into v from public.product_variants where id = it.variant_id and product_id = p.id and is_active;
      if not found then errors := errors || jsonb_build_object('product_id', p.id, 'message', 'Selected option unavailable for ' || p.name); continue; end if;
      avail := v.stock - v.reserved;
      unit := case when v.price is not null then coalesce(v.sale_price, v.price) else coalesce(v.sale_price, p.sale_price, p.price) end;
    else
      select count(*) into vcount from public.product_variants where product_id = p.id and is_active;
      if vcount > 0 then errors := errors || jsonb_build_object('product_id', p.id, 'message', 'Please choose an option for ' || p.name); continue; end if;
      avail := p.stock - p.reserved;
      unit := coalesce(p.sale_price, p.price);
    end if;
    if avail < it.quantity then
      errors := errors || jsonb_build_object('product_id', p.id, 'variant_id', it.variant_id, 'available', greatest(avail,0),
        'message', case when avail <= 0 then p.name || ' is sold out' else 'Only ' || avail || ' left of ' || p.name end);
      continue;
    end if;
    lines := lines || jsonb_build_object('product_id', p.id, 'variant_id', v.id, 'name', p.name, 'variant_name', v.name,
      'sku', coalesce(v.sku, p.sku), 'unit_price', unit, 'quantity', it.quantity, 'line_total', unit * it.quantity,
      'category_id', p.category_id,
      'image_url', (select url from public.product_images where product_id = p.id order by is_primary desc, sort_order limit 1));
    subtotal := subtotal + unit * it.quantity;
  end loop;

  if coalesce(trim(p_coupon), '') <> '' then
    select * into c from public.coupons where code = upper(trim(p_coupon));
    if not found or not c.is_active then coupon_error := 'Invalid coupon code';
    elsif c.starts_at is not null and c.starts_at > now() then coupon_error := 'This coupon is not active yet';
    elsif c.expires_at is not null and c.expires_at < now() then coupon_error := 'This coupon has expired';
    elsif c.usage_limit is not null and c.used_count >= c.usage_limit then coupon_error := 'This coupon has reached its usage limit';
    else
      if c.per_customer_limit is not null then
        select count(*) into used from public.coupon_redemptions r
        where r.coupon_id = c.id and ((p_user is not null and r.user_id = p_user) or lower(r.email) = lower(coalesce(p_email, '')));
        if used >= c.per_customer_limit then coupon_error := 'You have already used this coupon'; end if;
      end if;
      if coupon_error is null then
        select coalesce(sum((l->>'line_total')::numeric), 0) into eligible from jsonb_array_elements(lines) l
        where (cardinality(c.product_ids) = 0 and cardinality(c.category_ids) = 0)
           or (l->>'product_id')::uuid = any(c.product_ids)
           or (l->>'category_id' is not null and (l->>'category_id')::uuid = any(c.category_ids));
        if eligible <= 0 then coupon_error := 'This coupon does not apply to items in your cart';
        elsif subtotal < c.min_cart_value then coupon_error := 'Add items worth ₹' || (c.min_cart_value - subtotal) || ' more to use this coupon';
        elsif c.discount_type = 'percent' then discount := round(eligible * least(c.value, 100) / 100, 2);
        elsif c.discount_type = 'fixed' then discount := least(c.value, eligible);
        else free_ship := true; end if;
        if c.max_discount is not null then discount := least(discount, c.max_discount); end if;
      end if;
    end if;
  end if;

  if subtotal > 0 and not free_ship and (subtotal - discount) < coalesce((ship->>'free_above')::numeric, 999999999) then
    shipping := coalesce((ship->>'flat_fee')::numeric, 0);
  end if;
  rate := coalesce((tx->>'rate')::numeric, 0);
  if coalesce(tx->>'mode', 'inclusive') = 'inclusive' then
    tax := round((subtotal - discount) * rate / (100 + rate), 2);
    total := subtotal - discount + shipping;
  else
    tax := round((subtotal - discount) * rate / 100, 2);
    total := subtotal - discount + shipping + tax;
  end if;
  return jsonb_build_object('lines', lines, 'errors', errors, 'subtotal', subtotal, 'discount', discount,
    'shipping', shipping, 'tax', tax, 'tax_inclusive', coalesce(tx->>'mode','inclusive') = 'inclusive', 'tax_rate', rate,
    'total', total, 'coupon_code', case when coupon_error is null and c.id is not null then c.code end,
    'coupon_id', case when coupon_error is null then c.id end, 'coupon_error', coupon_error, 'free_shipping', free_ship);
end $$;

create or replace function public.quote_cart(p_items jsonb, p_coupon text default null, p_email text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._quote(p_items, p_coupon, p_email, auth.uid()) - 'coupon_id';
$$;

-- ---------- inventory helpers ----------
create or replace function public._release_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform set_config('app.stock_reason', 'reservation_released', true);
  for r in select * from public.inventory_reservations where order_id = p_order and status = 'active' order by product_id for update loop
    if r.variant_id is not null then
      update public.product_variants set reserved = greatest(reserved - r.quantity, 0) where id = r.variant_id;
    else
      update public.products set reserved = greatest(reserved - r.quantity, 0) where id = r.product_id;
    end if;
    update public.inventory_reservations set status = 'released' where id = r.id;
  end loop;
  update public.coupons c set used_count = greatest(c.used_count - 1, 0)
  from public.coupon_redemptions cr where cr.order_id = p_order and cr.coupon_id = c.id;
  delete from public.coupon_redemptions where order_id = p_order;
end $$;

create or replace function public._restore_stock(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; num text;
begin
  select order_number into num from public.orders where id = p_order;
  perform set_config('app.stock_reason', p_reason, true);
  perform set_config('app.stock_ref', num, true);
  for r in select * from public.order_items where order_id = p_order order by product_id loop
    if r.variant_id is not null then
      update public.product_variants set stock = stock + r.quantity where id = r.variant_id;
    elsif r.product_id is not null then
      update public.products set stock = stock + r.quantity where id = r.product_id;
    end if;
    update public.products set sold_count = greatest(sold_count - r.quantity, 0) where id = r.product_id;
  end loop;
  update public.orders set stock_committed = false where id = p_order;
end $$;

-- deduct stock for every item; returns false (and changes nothing) if any item lacks stock
create or replace function public._commit_stock(p_order uuid, p_from_reservation boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record; num text; ok boolean := true;
begin
  select order_number into num from public.orders where id = p_order;
  perform set_config('app.stock_reason', 'order', true);
  perform set_config('app.stock_ref', num, true);
  perform 1 from public.products where id in (select product_id from public.order_items where order_id = p_order) order by id for update;
  perform 1 from public.product_variants where id in (select variant_id from public.order_items where order_id = p_order) order by id for update;
  if not p_from_reservation then
    for r in select oi.*, coalesce(pv.stock - pv.reserved, p.stock - p.reserved) as av from public.order_items oi
             left join public.products p on p.id = oi.product_id left join public.product_variants pv on pv.id = oi.variant_id
             where oi.order_id = p_order loop
      if r.av is null or r.av < r.quantity then ok := false; end if;
    end loop;
    if not ok then return false; end if;
  end if;
  for r in select * from public.order_items where order_id = p_order loop
    if r.variant_id is not null then
      update public.product_variants set stock = stock - r.quantity,
        reserved = case when p_from_reservation then reserved - r.quantity else reserved end where id = r.variant_id;
    else
      update public.products set stock = stock - r.quantity,
        reserved = case when p_from_reservation then reserved - r.quantity else reserved end where id = r.product_id;
    end if;
    update public.products set sold_count = sold_count + r.quantity where id = r.product_id;
  end loop;
  update public.inventory_reservations set status = 'committed' where order_id = p_order and status = 'active';
  update public.orders set stock_committed = true where id = p_order;
  return true;
end $$;

create or replace function public.release_expired_reservations()
returns int language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select id, status from public.orders where status = 'pending_payment' and reservation_expires_at < now()
           for update skip locked loop
    perform public._release_order(o.id);
    update public.orders set status = 'payment_failed', payment_status = 'failed', cancel_reason = 'Payment window expired' where id = o.id;
    insert into public.order_status_history (order_id, from_status, to_status, note) values (o.id, 'pending_payment', 'payment_failed', 'Reservation expired');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- place order (atomic) ----------
create or replace function public.place_order(
  p_items jsonb, p_contact jsonb, p_address jsonb, p_coupon text, p_payment_method text,
  p_note text default null, p_whatsapp_opt_in boolean default false, p_idempotency_key uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ex public.orders; q jsonb; oid uuid; num text; pay jsonb := public._setting('payments');
  hold int := coalesce((pay->>'reservation_minutes')::int, 15); l jsonb; e text := lower(trim(p_contact->>'email'));
  is_cod boolean := p_payment_method = 'cod';
begin
  perform public.release_expired_reservations();
  if p_idempotency_key is not null then
    select * into ex from public.orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('order_id', ex.id, 'order_number', ex.order_number, 'access_token', ex.access_token,
        'total', ex.total, 'payment_method', ex.payment_method, 'status', ex.status, 'duplicate', true);
    end if;
  end if;
  if coalesce(length(trim(p_contact->>'name')), 0) not between 2 and 100 then raise exception 'Please enter your full name'; end if;
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  if coalesce(p_contact->>'phone', '') !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Please enter a valid phone number with country code'; end if;
  if coalesce(trim(p_address->>'line1'), '') = '' or coalesce(trim(p_address->>'city'), '') = '' or coalesce(trim(p_address->>'state'), '') = '' then
    raise exception 'Please complete the delivery address'; end if;
  if coalesce(p_address->>'pincode', '') !~ '^[1-9][0-9]{5}$' then raise exception 'Please enter a valid 6-digit PIN code'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) > 30 then raise exception 'Too many items in cart'; end if;
  if p_payment_method not in ('cod', 'razorpay') then raise exception 'Invalid payment method'; end if;
  if is_cod and not coalesce((pay->>'cod_enabled')::boolean, false) then raise exception 'Cash on Delivery is not available right now'; end if;
  if not is_cod and not coalesce((pay->>'razorpay_enabled')::boolean, false) then raise exception 'Online payment is not available right now'; end if;
  if is_cod and coalesce((pay->>'cod_max_order')::numeric, 0) > 0 then null; end if;

  -- lock inventory rows in a deterministic order to serialise concurrent checkouts
  perform 1 from public.products where id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  perform 1 from public.product_variants where id in (select (x->>'variant_id')::uuid from jsonb_array_elements(p_items) x where x->>'variant_id' is not null) order by id for update;
  if coalesce(trim(p_coupon), '') <> '' then perform 1 from public.coupons where code = upper(trim(p_coupon)) for update; end if;

  q := public._quote(p_items, p_coupon, e, auth.uid());
  if jsonb_array_length(q->'errors') > 0 then
    raise exception 'CART_INVALID: %', q->'errors'->0->>'message' using detail = (q->'errors')::text;
  end if;
  if q->>'coupon_error' is not null then raise exception 'COUPON_INVALID: %', q->>'coupon_error'; end if;
  if is_cod and coalesce((pay->>'cod_max_order')::numeric, 0) > 0 and (q->>'total')::numeric > (pay->>'cod_max_order')::numeric then
    raise exception 'Cash on Delivery is available for orders up to ₹%', pay->>'cod_max_order';
  end if;

  num := 'IMZ' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || nextval('public.order_number_seq');
  insert into public.orders (order_number, user_id, idempotency_key, customer_name, email, phone, shipping_address,
    subtotal, discount, shipping_fee, tax, tax_inclusive, total, coupon_code, payment_method, payment_status, status,
    reservation_expires_at, customer_note, whatsapp_opt_in, confirmed_at)
  values (num, auth.uid(), p_idempotency_key, trim(p_contact->>'name'), e, p_contact->>'phone',
    jsonb_build_object('full_name', coalesce(p_address->>'full_name', p_contact->>'name'), 'phone', coalesce(p_address->>'phone', p_contact->>'phone'),
      'line1', p_address->>'line1', 'line2', p_address->>'line2', 'city', p_address->>'city', 'state', p_address->>'state',
      'pincode', p_address->>'pincode', 'country', 'India'),
    (q->>'subtotal')::numeric, (q->>'discount')::numeric, (q->>'shipping')::numeric, (q->>'tax')::numeric,
    (q->>'tax_inclusive')::boolean, (q->>'total')::numeric, q->>'coupon_code', p_payment_method,
    case when is_cod then 'cod_pending' else 'pending' end,
    case when is_cod then 'confirmed' else 'pending_payment' end,
    case when is_cod then null else now() + make_interval(mins => hold) end,
    left(p_note, 500), coalesce(p_whatsapp_opt_in, false), case when is_cod then now() end)
  returning id into oid;

  for l in select * from jsonb_array_elements(q->'lines') loop
    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, image_url, unit_price, quantity, line_total)
    values (oid, (l->>'product_id')::uuid, nullif(l->>'variant_id','')::uuid, l->>'name', l->>'variant_name', l->>'sku', l->>'image_url',
      (l->>'unit_price')::numeric, (l->>'quantity')::int, (l->>'line_total')::numeric);
    if not is_cod then
      perform set_config('app.stock_reason', 'reserved', true);
      if l->>'variant_id' is not null then
        update public.product_variants set reserved = reserved + (l->>'quantity')::int where id = (l->>'variant_id')::uuid;
      else
        update public.products set reserved = reserved + (l->>'quantity')::int where id = (l->>'product_id')::uuid;
      end if;
      insert into public.inventory_reservations (order_id, product_id, variant_id, quantity, expires_at)
      values (oid, (l->>'product_id')::uuid, nullif(l->>'variant_id','')::uuid, (l->>'quantity')::int, now() + make_interval(mins => hold));
    end if;
  end loop;

  if is_cod then
    -- COD policy: stock is deducted immediately at order confirmation
    if not public._commit_stock(oid, false) then raise exception 'CART_INVALID: Stock changed, please review your cart'; end if;
  end if;

  if q->>'coupon_id' is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, amount)
    values ((q->>'coupon_id')::uuid, oid, auth.uid(), e, (q->>'discount')::numeric);
    update public.coupons set used_count = used_count + 1 where id = (q->>'coupon_id')::uuid;
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (oid, null, case when is_cod then 'confirmed' else 'pending_payment' end, 'Order placed', auth.uid());
  if is_cod then
    perform public._notify(oid, 'order_confirmed');
    perform public._notify(oid, 'new_order');
  end if;
  if auth.uid() is not null then delete from public.cart_items where user_id = auth.uid(); end if;
  return jsonb_build_object('order_id', oid, 'order_number', num, 'access_token', (select access_token from public.orders where id = oid),
    'total', (q->>'total')::numeric, 'payment_method', p_payment_method, 'status', case when is_cod then 'confirmed' else 'pending_payment' end);
end $$;

-- ---------- payments (server only: called by Netlify functions with service role) ----------
create or replace function public.confirm_payment(p_order_id uuid, p_provider_order_id text, p_payment_id text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; has_res boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_status = 'paid' then return jsonb_build_object('result', 'already_paid', 'order_number', o.order_number); end if;
  if p_amount is not null and p_amount <> o.total then raise exception 'AMOUNT_MISMATCH'; end if;
  update public.payment_transactions set provider_payment_id = p_payment_id, status = 'captured', updated_at = now()
  where provider_order_id = p_provider_order_id and order_id = o.id;
  select exists (select 1 from public.inventory_reservations where order_id = o.id and status = 'active') into has_res;
  if o.status = 'pending_payment' and has_res then
    perform public._commit_stock(o.id, true);
  elsif not public._commit_stock(o.id, false) then
    update public.orders set payment_status = 'paid', status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'Payment received after reservation expired and stock was no longer available. Refund required.' where id = o.id;
    insert into public.order_status_history (order_id, from_status, to_status, note) values (o.id, o.status, 'cancelled', 'Late payment, stock unavailable — refund required');
    perform public._notify(o.id, 'refund_required');
    return jsonb_build_object('result', 'refund_required', 'order_number', o.order_number);
  end if;
  update public.orders set payment_status = 'paid', status = 'confirmed', confirmed_at = now(), reservation_expires_at = null where id = o.id;
  insert into public.order_status_history (order_id, from_status, to_status, note) values (o.id, o.status, 'confirmed', 'Payment verified');
  perform public._notify(o.id, 'order_confirmed');
  perform public._notify(o.id, 'new_order');
  return jsonb_build_object('result', 'confirmed', 'order_number', o.order_number);
end $$;

create or replace function public.fail_payment(p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'pending_payment' then return jsonb_build_object('result', 'ignored'); end if;
  perform public._release_order(o.id);
  update public.orders set status = 'payment_failed', payment_status = 'failed', cancel_reason = left(p_reason, 300) where id = o.id;
  insert into public.order_status_history (order_id, from_status, to_status, note) values (o.id, o.status, 'payment_failed', left(p_reason, 300));
  perform public._notify(o.id, 'payment_failed');
  return jsonb_build_object('result', 'failed');
end $$;

-- ---------- order status workflow ----------
create or replace function public._transitions() returns jsonb language sql immutable as $$
  select '{
    "pending_payment":["payment_failed","cancelled"],
    "confirmed":["processing","ready_to_ship","cancelled"],
    "processing":["ready_to_ship","cancelled"],
    "ready_to_ship":["shipped","cancelled"],
    "shipped":["out_for_delivery","delivered","returned"],
    "out_for_delivery":["delivered","returned"],
    "delivered":["return_requested","return_approved"],
    "cancellation_requested":["cancelled","confirmed","processing"],
    "return_requested":["return_approved","delivered"],
    "return_approved":["returned"],
    "returned":["refund_initiated","refunded"],
    "cancelled":["refund_initiated","refunded"],
    "refund_initiated":["refunded"],
    "refunded":[], "payment_failed":[]
  }'::jsonb;
$$;

create or replace function public._apply_status(o public.orders, p_status text, p_note text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public._transitions()->o.status) ? p_status then
    raise exception 'INVALID_TRANSITION: cannot move from % to %', o.status, p_status;
  end if;
  if p_status in ('refund_initiated', 'refunded') and o.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'Refunds apply only to paid orders';
  end if;
  if p_status = 'cancelled' then
    if o.stock_committed then perform public._restore_stock(o.id, 'cancellation'); end if;
    perform public._release_order(o.id);
  elsif p_status = 'returned' and o.stock_committed then
    perform public._restore_stock(o.id, 'return');
  end if;
  update public.orders set status = p_status,
    shipped_at = case when p_status = 'shipped' then now() else shipped_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_status = 'cancelled' then coalesce(left(p_note, 300), cancel_reason) else cancel_reason end,
    payment_status = case when p_status = 'refunded' then 'refunded'
                          when p_status = 'delivered' and payment_method = 'cod' then 'paid'
                          when p_status = 'cancelled' and payment_status = 'cod_pending' then 'failed'
                          else payment_status end,
    refunded_amount = case when p_status = 'refunded' then total else refunded_amount end
  where id = o.id;
  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by) values (o.id, o.status, p_status, left(p_note, 500), p_actor);
  update public.returns_and_refunds set status = case when p_status in ('cancelled','return_approved','returned','refunded') then 'approved' else 'rejected' end, updated_at = now()
  where order_id = o.id and status = 'requested' and o.status in ('cancellation_requested', 'return_requested');
  perform public._notify(o.id, p_status);
end $$;

create or replace function public.admin_update_order(p_order_id uuid, p_status text default null, p_note text default null,
  p_courier text default null, p_tracking_number text default null, p_tracking_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.has_perm('orders') then raise exception 'FORBIDDEN'; end if;
  if p_status in ('refund_initiated', 'refunded') and not public.has_perm('refunds') then raise exception 'FORBIDDEN: refunds need manager or owner'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_tracking_url is not null and p_tracking_url <> '' and p_tracking_url !~ '^https?://' then raise exception 'Tracking URL must start with http(s)://'; end if;
  if p_courier is not null or p_tracking_number is not null or p_tracking_url is not null then
    update public.orders set courier_name = coalesce(nullif(p_courier, ''), courier_name),
      tracking_number = coalesce(nullif(p_tracking_number, ''), tracking_number),
      tracking_url = coalesce(nullif(p_tracking_url, ''), tracking_url) where id = o.id;
  end if;
  if p_status is not null and p_status <> o.status then
    select * into o from public.orders where id = p_order_id;
    perform public._apply_status(o, p_status, p_note, auth.uid());
  end if;
  select * into o from public.orders where id = p_order_id;
  if p_status in ('ready_to_ship', 'shipped', 'out_for_delivery', 'delivered') or p_tracking_number is not null then
    insert into public.shipping_updates (order_id, status, message, courier_name, tracking_number, tracking_url)
    values (o.id, o.status, p_note, o.courier_name, o.tracking_number, o.tracking_url);
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'update_order', 'orders', o.id::text, jsonb_build_object('status', p_status, 'tracking', p_tracking_number));
  return jsonb_build_object('status', o.status);
end $$;

create or replace function public._can_access_order(o public.orders, p_token uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is not null and o.user_id = auth.uid()) or (p_token is not null and o.access_token = p_token) or public.has_perm('orders');
$$;

create or replace function public.get_order(p_order_number text, p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where order_number = p_order_number;
  if not found or not public._can_access_order(o, p_token) then raise exception 'ORDER_NOT_FOUND'; end if;
  return to_jsonb(o) - 'idempotency_key' || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.product_name), '[]') from public.order_items i where i.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('to_status', h.to_status, 'created_at', h.created_at) order by h.created_at), '[]') from public.order_status_history h where h.order_id = o.id),
    'shipping_updates', (select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at), '[]') from public.shipping_updates s where s.order_id = o.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('type', r.type, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at)), '[]') from public.returns_and_refunds r where r.order_id = o.id),
    'return_window_days', coalesce((public._setting('policies')->>'return_window_days')::int, 7));
end $$;

create or replace function public.customer_cancel_order(p_order_number text, p_token uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where order_number = p_order_number for update;
  if not found or not ((auth.uid() is not null and o.user_id = auth.uid()) or o.access_token = p_token) then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = 'pending_payment' or (o.status in ('confirmed', 'processing') and o.payment_status <> 'paid') then
    perform public._apply_status(o, 'cancelled', coalesce(p_reason, 'Cancelled by customer'), auth.uid());
    insert into public.returns_and_refunds (order_id, user_id, type, reason, status) values (o.id, o.user_id, 'cancellation', p_reason, 'completed');
    return jsonb_build_object('status', 'cancelled');
  elsif o.status in ('confirmed', 'processing') then
    update public.orders set status = 'cancellation_requested' where id = o.id;
    insert into public.order_status_history (order_id, from_status, to_status, note, changed_by) values (o.id, o.status, 'cancellation_requested', left(p_reason, 500), auth.uid());
    insert into public.returns_and_refunds (order_id, user_id, type, reason, amount) values (o.id, o.user_id, 'cancellation', left(p_reason, 500), o.total);
    perform public._notify(o.id, 'cancellation_requested');
    return jsonb_build_object('status', 'cancellation_requested');
  end if;
  raise exception 'This order can no longer be cancelled online. Please contact support.';
end $$;

create or replace function public.customer_request_return(p_order_number text, p_token uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; days int := coalesce((public._setting('policies')->>'return_window_days')::int, 7);
begin
  select * into o from public.orders where order_number = p_order_number for update;
  if not found or not ((auth.uid() is not null and o.user_id = auth.uid()) or o.access_token = p_token) then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'delivered' or o.delivered_at < now() - make_interval(days => days) then
    raise exception 'Returns are accepted within % days of delivery', days;
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Please describe the reason for return'; end if;
  update public.orders set status = 'return_requested' where id = o.id;
  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by) values (o.id, o.status, 'return_requested', left(p_reason, 500), auth.uid());
  insert into public.returns_and_refunds (order_id, user_id, type, reason, amount) values (o.id, o.user_id, 'return', left(p_reason, 500), o.total);
  perform public._notify(o.id, 'return_requested');
  return jsonb_build_object('status', 'return_requested');
end $$;

-- ---------- reviews, newsletter, analytics ----------
create or replace function public.submit_review(p_product_id uuid, p_rating int, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare verified boolean;
begin
  if auth.uid() is null then raise exception 'Please log in to review'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be 1-5'; end if;
  select exists (select 1 from public.orders o join public.order_items i on i.order_id = o.id
                 where o.user_id = auth.uid() and i.product_id = p_product_id and o.status = 'delivered') into verified;
  insert into public.product_reviews (product_id, user_id, author_name, rating, title, body, is_verified)
  values (p_product_id, auth.uid(), (select split_part(coalesce(full_name, 'Customer'), ' ', 1) from public.profiles where id = auth.uid()),
          p_rating, left(p_title, 120), left(p_body, 2000), verified)
  on conflict (product_id, user_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body, status = 'pending';
  return jsonb_build_object('verified', verified);
end $$;

create or replace function public.subscribe_newsletter(p_email text, p_consent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(p_consent, false) then raise exception 'Consent is required'; end if;
  if lower(trim(p_email)) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  insert into public.newsletter_subscriptions (email, consent) values (lower(trim(p_email)), true)
  on conflict (email) do update set unsubscribed_at = null;
end $$;

create or replace function public.track_event(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n int; inserted int;
begin
  if coalesce((public._setting('analytics')->>'enabled')::boolean, true) = false then return; end if;
  select count(*) into n from public.analytics_events where visitor_id = p->>'visitor_id' and created_at > now() - interval '1 hour';
  if n > 400 then return; end if;
  insert into public.analytics_events (event_id, event_type, visitor_id, session_id, path, product_id, category_slug, search_query, referrer, utm_source, utm_medium, utm_campaign, device)
  values ((p->>'event_id')::uuid, p->>'event_type', left(p->>'visitor_id', 64), left(p->>'session_id', 64), left(p->>'path', 300),
    (select id from public.products where id = nullif(p->>'product_id', '')::uuid), left(p->>'category_slug', 80), left(p->>'search_query', 120),
    left(p->>'referrer', 200), left(p->>'utm_source', 80), left(p->>'utm_medium', 80), left(p->>'utm_campaign', 80), left(p->>'device', 20))
  on conflict (event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 and p->>'event_type' = 'product_view' then
    update public.products set view_count = view_count + 1 where id = nullif(p->>'product_id', '')::uuid;
  end if;
end $$;

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  update public.profiles set deletion_requested_at = now() where id = auth.uid();
  perform public._notify_owner('account_deletion_requested', null, jsonb_build_object('user_id', auth.uid()));
end $$;

-- ---------- admin RPCs ----------
create or replace function public.admin_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; today_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata';
begin
  if not public.has_perm('view') then raise exception 'FORBIDDEN'; end if;
  with v as (select * from public.orders where created_at >= p_from and created_at < p_to and status not in ('pending_payment','payment_failed','cancelled')),
  allr as (select * from public.orders where created_at >= p_from and created_at < p_to)
  select jsonb_build_object(
    'orders', (select count(*) from v),
    'gross_sales', (select coalesce(sum(subtotal), 0) from v),
    'discounts', (select coalesce(sum(discount), 0) from v),
    'refunds', (select coalesce(sum(refunded_amount), 0) from allr),
    'net_sales', (select coalesce(sum(total - shipping_fee), 0) from v) - (select coalesce(sum(refunded_amount), 0) from allr),
    'payments_collected', (select coalesce(sum(total), 0) from v where payment_status = 'paid'),
    'aov', (select coalesce(round(avg(total), 2), 0) from v),
    'failed_payments', (select count(*) from allr where status = 'payment_failed'),
    'cancelled', (select count(*) from allr where status = 'cancelled'),
    'delivered', (select count(*) from allr where status = 'delivered'),
    'today_orders', (select count(*) from public.orders where created_at >= today_start and status not in ('pending_payment','payment_failed','cancelled')),
    'today_sales', (select coalesce(sum(total), 0) from public.orders where created_at >= today_start and status not in ('pending_payment','payment_failed','cancelled')),
    'awaiting_processing', (select count(*) from public.orders where status in ('confirmed','processing')),
    'ready_to_ship', (select count(*) from public.orders where status = 'ready_to_ship'),
    'shipped', (select count(*) from public.orders where status in ('shipped','out_for_delivery')),
    'needs_attention', (select count(*) from public.orders where status in ('cancellation_requested','return_requested')),
    'customers', (select count(*) from public.profiles),
    'new_customers', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
    'active_products', (select count(*) from public.products where status = 'published'),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'available', available)), '[]') from public.catalog where status = 'published' and available > 0 and available <= low_stock_threshold),
    'out_of_stock', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]') from public.catalog where status = 'published' and available <= 0),
    'bestsellers', (select coalesce(jsonb_agg(b), '[]') from (select i.product_name as name, sum(i.quantity) as qty, sum(i.line_total) as revenue from public.order_items i join v on v.id = i.order_id group by i.product_name order by 2 desc limit 5) b),
    'trend', (select coalesce(jsonb_agg(t order by t.day), '[]') from (
        select d::date as day, (select count(*) from v where (v.created_at at time zone 'Asia/Kolkata')::date = d::date) as orders,
               (select coalesce(sum(total), 0) from v where (v.created_at at time zone 'Asia/Kolkata')::date = d::date) as revenue
        from generate_series((p_from at time zone 'Asia/Kolkata')::date, ((p_to - interval '1 second') at time zone 'Asia/Kolkata')::date, interval '1 day') d) t)
  ) into r;
  return r;
end $$;

create or replace function public.admin_traffic(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.has_perm('view') then raise exception 'FORBIDDEN'; end if;
  with e as (select * from public.analytics_events where created_at >= p_from and created_at < p_to)
  select jsonb_build_object(
    'tracking_since', (select min(created_at) from public.analytics_events),
    'page_views', (select count(*) from e where event_type = 'page_view'),
    'unique_visitors', (select count(distinct visitor_id) from e),
    'product_views', (select count(*) from e where event_type = 'product_view'),
    'searches', (select count(*) from e where event_type = 'search'),
    'add_to_cart', (select count(*) from e where event_type = 'add_to_cart'),
    'checkout_visitors', (select count(distinct visitor_id) from e where event_type = 'checkout_start'),
    'order_visitors', (select count(distinct visitor_id) from e where event_type = 'order_placed'),
    'live_visitors', (select count(distinct visitor_id) from public.analytics_events where created_at > now() - interval '5 minutes'),
    'top_products', (select coalesce(jsonb_agg(x), '[]') from (select p.name, count(*) as views from e join public.products p on p.id = e.product_id where event_type = 'product_view' group by p.name order by 2 desc limit 5) x),
    'top_cart', (select coalesce(jsonb_agg(x), '[]') from (select p.name, count(*) as adds from e join public.products p on p.id = e.product_id where event_type = 'add_to_cart' group by p.name order by 2 desc limit 5) x),
    'top_searches', (select coalesce(jsonb_agg(x), '[]') from (select lower(search_query) as query, count(*) as n from e where event_type = 'search' and search_query is not null group by 1 order by 2 desc limit 8) x),
    'top_categories', (select coalesce(jsonb_agg(x), '[]') from (select category_slug as category, count(*) as n from e where category_slug is not null group by 1 order by 2 desc limit 8) x),
    'sources', (select coalesce(jsonb_agg(x), '[]') from (select coalesce(utm_source, nullif(substring(referrer from '^https?://([^/]+)'), ''), 'direct') as source, count(distinct visitor_id) as visitors from e group by 1 order by 2 desc limit 8) x),
    'campaigns', (select coalesce(jsonb_agg(x), '[]') from (select utm_campaign as campaign, count(distinct visitor_id) as visitors from e where utm_campaign is not null group by 1 order by 2 desc limit 8) x),
    'devices', (select coalesce(jsonb_agg(x), '[]') from (select coalesce(device, 'unknown') as device, count(distinct visitor_id) as visitors from e group by 1 order by 2 desc) x),
    'daily', (select coalesce(jsonb_agg(x order by x.day), '[]') from (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) filter (where event_type = 'page_view') as views, count(distinct visitor_id) as visitors from e group by 1) x)
  ) into r;
  return r;
end $$;

create or replace function public.admin_customers(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('customers') then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(c order by c.created_at desc), '[]') from (
    select p.id, p.full_name, p.phone, u.email, p.created_at, p.marketing_opt_in, p.whatsapp_opt_in, p.deletion_requested_at,
      (select count(*) from public.orders o where o.user_id = p.id and o.status not in ('pending_payment','payment_failed')) as order_count,
      (select coalesce(sum(o.total - o.refunded_amount), 0) from public.orders o where o.user_id = p.id and o.status not in ('pending_payment','payment_failed','cancelled')) as lifetime_spend
    from public.profiles p join auth.users u on u.id = p.id
    where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%' or p.phone ilike '%' || p_search || '%'
    limit 200) c);
end $$;

create or replace function public.admin_delete_customer(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'owner' then raise exception 'FORBIDDEN: owner only'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id) then raise exception 'Remove staff role first'; end if;
  -- orders are retained (user link removed) for accounting; profile, addresses, cart, wishlist cascade
  delete from auth.users where id = p_user_id;
  insert into public.admin_audit_logs (actor_id, action, entity, entity_id) values (auth.uid(), 'delete_customer', 'auth.users', p_user_id::text);
end $$;

create or replace function public.admin_staff()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('staff') then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', u.email, 'role', r.role, 'created_at', r.created_at)), '[]')
          from public.user_roles r join auth.users u on u.id = r.user_id);
end $$;

create or replace function public.admin_set_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if public.my_role() is distinct from 'owner' then raise exception 'FORBIDDEN: owner only'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email. Ask them to register first.'; end if;
  if uid = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role is null or p_role = '' then
    delete from public.user_roles where user_id = uid;
  else
    insert into public.user_roles (user_id, role, created_by) values (uid, p_role::public.staff_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role;
  end if;
end $$;

create or replace function public.admin_bulk_update(p_updates jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  if not public.has_perm('products') then raise exception 'FORBIDDEN'; end if;
  perform set_config('app.stock_reason', 'bulk_update', true);
  for u in select * from jsonb_to_recordset(p_updates) as x(id uuid, stock int, price numeric, sale_price numeric, clear_sale boolean) loop
    update public.products set
      stock = coalesce(u.stock, stock),
      price = coalesce(u.price, price),
      sale_price = case when u.clear_sale then null else coalesce(u.sale_price, sale_price) end
    where id = u.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where order_number = upper(trim(p_order_number)) and lower(email) = lower(trim(p_email));
  if not found then raise exception 'No order found with those details'; end if;
  return jsonb_build_object('order_number', o.order_number, 'status', o.status, 'created_at', o.created_at,
    'courier_name', o.courier_name, 'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url);
end $$;


-- ---------- grants ----------
revoke execute on function public.confirm_payment(uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.fail_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public._quote(jsonb, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._release_order(uuid) from public, anon, authenticated;
revoke execute on function public._restore_stock(uuid, text) from public, anon, authenticated;
revoke execute on function public._commit_stock(uuid, boolean) from public, anon, authenticated;
revoke execute on function public._notify(uuid, text) from public, anon, authenticated;
revoke execute on function public._notify_owner(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._apply_status(public.orders, text, text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text, text, numeric) to service_role;
grant execute on function public.fail_payment(uuid, text) to service_role;

create or replace function public.mark_refunded(p_order_id uuid, p_refund_id text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status = 'refunded' then return; end if;
  update public.returns_and_refunds set status = 'completed', updated_at = now() where order_id = o.id and provider_refund_id = p_refund_id;
  update public.payment_transactions set status = 'refunded', updated_at = now() where order_id = o.id and status = 'captured';
  if (public._transitions()->o.status) ? 'refunded' then
    perform public._apply_status(o, 'refunded', 'Razorpay refund ' || p_refund_id, null);
  end if;
end $$;
revoke execute on function public.mark_refunded(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refunded(uuid, text) to service_role;
revoke execute on function public.release_expired_reservations() from anon;

