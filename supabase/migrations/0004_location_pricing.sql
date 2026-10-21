-- IMINATIONZ: location-based pricing. Run AFTER 0001-0003 (re-runnable). Re-run this file if you ever re-run 0002.
-- The shopper's browser sends its GPS position in the "x-geo: lat,lng" request header; prices are decided here, server side.

insert into public.store_settings (key, value, is_public)
values ('location_pricing', '{"enabled": false, "radius_km": 10, "extra_amount": 0}', false)
on conflict (key) do update set is_public = false;

create or replace function public._settings_private() returns trigger language plpgsql as $$
begin
  if new.key = 'location_pricing' then new.is_public := false; end if;
  return new;
end $$;
drop trigger if exists store_settings_private on public.store_settings;
create trigger store_settings_private before insert or update on public.store_settings for each row execute function public._settings_private();

create or replace function public._km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns numeric
language sql immutable as $$
  select (6371 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::numeric;
$$;

create or replace function public._geo_header() returns text language plpgsql stable as $$
declare g text;
begin
  begin g := current_setting('request.headers', true)::json->>'x-geo'; exception when others then g := null; end;
  if g is null or g !~ '^-?[0-9]{1,3}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$' then return null; end if;
  return g;
end $$;

-- extra ₹ per item for this request: 0 nearby, extra_amount when farther than radius_km or location unknown
create or replace function public._geo_extra() returns numeric
language plpgsql stable security definer set search_path = public as $$
declare s jsonb := public._setting('location_pricing'); g text := public._geo_header(); amt numeric; slat numeric; slng numeric;
begin
  amt := coalesce(nullif(s->>'extra_amount', '')::numeric, 0);
  slat := nullif(s->>'lat', '')::numeric; slng := nullif(s->>'lng', '')::numeric;
  if not coalesce((s->>'enabled')::boolean, false) or amt <= 0 or slat is null or slng is null then return 0; end if;
  if g is null then return amt; end if;
  return case when public._km(split_part(g, ',', 1)::numeric, split_part(g, ',', 2)::numeric, slat, slng)
    > coalesce(nullif(s->>'radius_km', '')::numeric, 10) then amt else 0 end;
end $$;

create or replace function public.price_zone() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('enabled', coalesce((public._setting('location_pricing')->>'enabled')::boolean, false), 'extra', public._geo_extra());
$$;
grant execute on function public.price_zone() to anon, authenticated;
revoke execute on function public._geo_extra() from public, anon, authenticated;

alter table public.orders add column if not exists location_extra numeric(10,2) not null default 0;
alter table public.orders add column if not exists customer_geo text;

create or replace function public._order_geo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.location_extra := public._geo_extra();
  new.customer_geo := public._geo_header();
  return new;
end $$;
drop trigger if exists orders_geo on public.orders;
create trigger orders_geo before insert on public.orders for each row execute function public._order_geo();

-- pricing (single source of truth) — same as 0002 plus the location extra on every unit price
create or replace function public._quote(p_items jsonb, p_coupon text, p_email text, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it record; p public.products; v public.product_variants; avail int; unit numeric; vcount int;
  lines jsonb := '[]'; errors jsonb := '[]'; subtotal numeric := 0; eligible numeric := 0;
  c public.coupons; coupon_error text; discount numeric := 0; free_ship boolean := false;
  ship jsonb := public._setting('shipping'); tx jsonb := public._setting('tax');
  shipping numeric := 0; tax numeric := 0; total numeric; rate numeric; used int;
  ex numeric := public._geo_extra();
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
      unit := case when v.price is not null then coalesce(v.sale_price, v.price) else coalesce(v.sale_price, p.sale_price, p.price) end + ex;
    else
      select count(*) into vcount from public.product_variants where product_id = p.id and is_active;
      if vcount > 0 then errors := errors || jsonb_build_object('product_id', p.id, 'message', 'Please choose an option for ' || p.name); continue; end if;
      avail := p.stock - p.reserved;
      unit := coalesce(p.sale_price, p.price) + ex;
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
revoke execute on function public._quote(jsonb, text, text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
