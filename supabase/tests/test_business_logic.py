"""Business-logic tests for the IMINATIONZ database layer.
Run: bash supabase/tests/apply_local.sh && python3 -m pytest -q supabase/tests/test_business_logic.py
Uses a throwaway local PostgreSQL DB (never the live Supabase project)."""
import json
import os
import threading
import uuid

import psycopg2
import pytest

DSN = os.environ.get("TEST_DSN", "dbname=imz_test user=postgres host=/var/run/postgresql")


def conn():
    c = psycopg2.connect(DSN)
    c.autocommit = True
    return c


def q(sql, args=None, role=None, uid=None, one=False):
    c = conn()
    try:
        with c.cursor() as cur:
            cur.execute("begin")
            if role:
                cur.execute(f"set local role {role}")
            if uid:
                cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(uid),))
            cur.execute(sql, args)
            rows = cur.fetchall() if cur.description else None
            cur.execute("commit")
            return (rows[0][0] if rows else None) if one else rows
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def new_user(email=None, role=None):
    uid = uuid.uuid4()
    q("insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)", (str(uid), email or f"TEST_{uid.hex[:8]}@example.com", json.dumps({"full_name": "Test User", "phone": "+919876543210"})))
    if role:
        q("insert into public.user_roles (user_id, role) values (%s, %s)", (str(uid), role))
    return uid


def new_product(stock=5, price=1000, status="published"):
    sku = f"TEST-{uuid.uuid4().hex[:8]}"
    pid = q("insert into products (name, slug, sku, price, stock, status) values (%s,%s,%s,%s,%s,%s) returning id", (f"TEST {sku}", sku.lower(), sku, price, stock, status), one=True)
    return pid


CONTACT = {"name": "Test Buyer", "email": "TEST_buyer@example.com", "phone": "+919876543210"}
ADDR = {"line1": "1 Test Street", "city": "Jaipur", "state": "Rajasthan", "pincode": "302001"}


def place(pid, qty=1, method="cod", coupon=None, uid=None, key=None, email=None):
    contact = dict(CONTACT, email=email or CONTACT["email"])
    return q("select place_order(%s::jsonb, %s::jsonb, %s::jsonb, %s, %s, null, false, %s)",
             (json.dumps([{"product_id": str(pid), "quantity": qty}]), json.dumps(contact), json.dumps(ADDR), coupon, method, key),
             role="authenticated" if uid else "anon", uid=uid, one=True)


def stock(pid):
    return q("select stock, reserved from products where id = %s", (str(pid),))[0]


@pytest.fixture(autouse=True, scope="module")
def payments_on():
    q("""update store_settings set value = value || '{"razorpay_enabled": true, "cod_enabled": true}'::jsonb where key = 'payments'""")
    yield


def test_seed_marks_zero_stock_sold_out():
    assert q("select available from catalog where sku = 'DEMO-SET-001'", one=True) == 0
    assert q("select count(*) from products where is_demo", one=True) == 7


def test_quote_server_side_totals():
    pid = new_product(stock=5, price=899)
    r = q("select quote_cart(%s::jsonb)", (json.dumps([{"product_id": str(pid), "quantity": 1}]),), role="anon", one=True)
    assert float(r["subtotal"]) == 899 and float(r["shipping"]) == 79 and float(r["total"]) == 978
    r2 = q("select quote_cart(%s::jsonb)", (json.dumps([{"product_id": str(pid), "quantity": 2}]),), role="anon", one=True)
    assert float(r2["shipping"]) == 0  # free shipping above 999


def test_cod_order_deducts_stock_and_logs_movement():
    pid = new_product(stock=5)
    r = place(pid, 2)
    assert r["status"] == "confirmed"
    assert stock(pid) == (3, 0)
    mv = q("select change, reason, reference from inventory_movements where product_id = %s", (str(pid),))
    assert mv == [(-2, "order", r["order_number"])]
    assert q("select count(*) from notification_logs where order_id = %s", (r["order_id"],), one=True) >= 1


def test_concurrent_final_units_never_oversell():
    pid = new_product(stock=5)
    results = []

    def buy():
        try:
            results.append(place(pid, 1)["order_number"])
        except Exception as e:  # noqa: BLE001
            results.append(f"ERR:{e}")

    threads = [threading.Thread(target=buy) for _ in range(12)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    ok = [x for x in results if not x.startswith("ERR")]
    assert len(ok) == 5
    assert all("sold out" in x or "Only" in x for x in results if x.startswith("ERR"))
    assert stock(pid) == (0, 0)
    assert q("select available from catalog where id = %s", (str(pid),), one=True) == 0


def test_concurrent_multi_unit_orders():
    pid = new_product(stock=5)
    out = []
    ts = [threading.Thread(target=lambda: out.append(_try(lambda: place(pid, 3)))) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sum(1 for x in out if x) == 1 and stock(pid) == (2, 0)


def _try(fn):
    try:
        return fn()
    except Exception:  # noqa: BLE001
        return None


def test_online_reservation_and_expiry_release():
    pid = new_product(stock=2)
    r = place(pid, 2, "razorpay")
    assert r["status"] == "pending_payment" and stock(pid) == (2, 2)
    assert q("select available from catalog where id = %s", (str(pid),), one=True) == 0
    with pytest.raises(Exception, match="sold out"):
        place(pid, 1)
    q("update orders set reservation_expires_at = now() - interval '1 minute' where id = %s", (r["order_id"],))
    q("select release_expired_reservations()")
    assert stock(pid) == (2, 0)
    assert q("select status from orders where id = %s", (r["order_id"],), one=True) == "payment_failed"


def test_confirm_payment_idempotent_and_server_only():
    pid = new_product(stock=3)
    r = place(pid, 1, "razorpay")
    q("insert into payment_transactions (order_id, provider_order_id, amount) values (%s, %s, %s)", (r["order_id"], "order_TEST1", r["total"]))
    with pytest.raises(Exception, match="permission denied"):
        q("select confirm_payment(%s, 'order_TEST1', 'pay_TEST1', %s)", (r["order_id"], r["total"]), role="anon")
    first = q("select confirm_payment(%s, 'order_TEST1', 'pay_TEST1', %s)", (r["order_id"], r["total"]), role="service_role", one=True)
    second = q("select confirm_payment(%s, 'order_TEST1', 'pay_TEST1', %s)", (r["order_id"], r["total"]), role="service_role", one=True)
    assert first["result"] == "confirmed" and second["result"] == "already_paid"
    assert stock(pid) == (2, 0)
    with pytest.raises(Exception, match="AMOUNT_MISMATCH"):
        r2 = place(pid, 1, "razorpay")
        q("select confirm_payment(%s, 'x', 'y', 1)", (r2["order_id"],), role="service_role")


def test_duplicate_webhook_event_rejected():
    eid = f"evt_TEST_{uuid.uuid4().hex[:6]}"
    q("insert into payment_webhook_events (event_id, event_type, payload) values (%s, 'payment.captured', '{}')", (eid,))
    with pytest.raises(psycopg2.errors.UniqueViolation):
        q("insert into payment_webhook_events (event_id, event_type, payload) values (%s, 'payment.captured', '{}')", (eid,))


def test_coupon_validation_and_usage_limit():
    pid = new_product(stock=10, price=1000)
    code = f"TEST{uuid.uuid4().hex[:5].upper()}"
    q("insert into coupons (code, discount_type, value, min_cart_value, max_discount, usage_limit) values (%s, 'percent', 20, 500, 150, 1)", (code,))
    r = place(pid, 1, coupon=code.lower())
    assert float(q("select discount from orders where id = %s", (r["order_id"],), one=True)) == 150
    quote = q("select quote_cart(%s::jsonb, %s)", (json.dumps([{"product_id": str(pid), "quantity": 1}]), code), role="anon", one=True)
    assert "usage limit" in quote["coupon_error"]
    with pytest.raises(Exception, match="COUPON_INVALID"):
        place(pid, 1, coupon=code)
    bad = q("select quote_cart(%s::jsonb, 'NOPE')", (json.dumps([{"product_id": str(pid), "quantity": 1}]),), role="anon", one=True)
    assert bad["coupon_error"] == "Invalid coupon code"


def test_idempotency_key_prevents_duplicate_orders():
    pid = new_product(stock=5)
    key = str(uuid.uuid4())
    a = place(pid, 1, key=key)
    b = place(pid, 1, key=key)
    assert a["order_id"] == b["order_id"] and b["duplicate"] is True and stock(pid) == (4, 0)


def test_status_transitions_and_permissions():
    owner = new_user(role="owner")
    fulfil = new_user(role="fulfilment")
    customer = new_user()
    pid = new_product(stock=5)
    r = place(pid, 2)
    oid = r["order_id"]
    with pytest.raises(Exception, match="FORBIDDEN"):
        q("select admin_update_order(%s, 'processing')", (oid,), role="authenticated", uid=customer)
    with pytest.raises(Exception, match="INVALID_TRANSITION"):
        q("select admin_update_order(%s, 'delivered')", (oid,), role="authenticated", uid=owner)
    q("select admin_update_order(%s, 'processing')", (oid,), role="authenticated", uid=fulfil)
    q("select admin_update_order(%s, 'cancelled', 'TEST cancel')", (oid,), role="authenticated", uid=owner)
    assert stock(pid) == (5, 0)
    hist = q("select to_status from order_status_history where order_id = %s order by created_at", (oid,))
    assert [h[0] for h in hist] == ["confirmed", "processing", "cancelled"]
    with pytest.raises(Exception, match="Refunds apply only to paid"):
        q("select admin_update_order(%s, 'refunded')", (oid,), role="authenticated", uid=owner)


def test_customer_data_isolation_rls():
    a, b = new_user(), new_user()
    pid = new_product(stock=5)
    ra = place(pid, 1, uid=a, email="TEST_a@example.com")
    q("insert into addresses (user_id, full_name, phone, line1, city, state, pincode) values (%s,'A','+91','x','y','z','302001')", (str(a),), role="authenticated", uid=a)
    assert q("select count(*) from orders", role="authenticated", uid=b, one=True) == 0
    assert q("select count(*) from addresses", role="authenticated", uid=b, one=True) == 0
    assert q("select count(*) from orders", role="authenticated", uid=a, one=True) == 1
    assert q("select count(*) from orders", role="anon", one=True) == 0
    with pytest.raises(Exception, match="ORDER_NOT_FOUND"):
        q("select get_order(%s, %s)", (ra["order_number"], str(uuid.uuid4())), role="anon")
    with pytest.raises(Exception, match="ORDER_NOT_FOUND"):
        q("select get_order(%s, null)", (ra["order_number"],), role="authenticated", uid=b)
    assert q("select get_order(%s, %s)", (ra["order_number"], ra["access_token"]), role="anon", one=True)["order_number"] == ra["order_number"]


def test_admin_privileges_cannot_be_self_granted():
    u = new_user()
    with pytest.raises(Exception):
        q("insert into user_roles (user_id, role) values (%s, 'owner')", (str(u),), role="authenticated", uid=u)
    with pytest.raises(Exception, match="owner only"):
        q("select admin_set_role('x@example.com', 'owner')", role="authenticated", uid=u)
    assert q("update products set price = 1 where sku = 'DEMO-JH-001' returning id", role="authenticated", uid=u) == []
    assert q("select count(*) from store_settings where key = 'notifications'", role="anon", one=True) == 0


def test_public_sees_only_published_products():
    pid = new_product(stock=5, status="draft")
    assert q("select count(*) from products where id = %s", (str(pid),), role="anon", one=True) == 0
    staff = new_user(role="analyst")
    assert q("select count(*) from products where id = %s", (str(pid),), role="authenticated", uid=staff, one=True) == 1
    with pytest.raises(Exception, match="unavailable|no longer available"):
        place(pid, 1)


def test_return_window_and_cancel_by_customer():
    owner = new_user(role="owner")
    u = new_user()
    pid = new_product(stock=5)
    r = place(pid, 1, uid=u)
    res = q("select customer_cancel_order(%s, null, 'TEST changed mind')", (r["order_number"],), role="authenticated", uid=u, one=True)
    assert res["status"] == "cancelled" and stock(pid) == (5, 0)
    r2 = place(pid, 1, uid=u)
    for s in ["processing", "ready_to_ship", "shipped", "delivered"]:
        q("select admin_update_order(%s, %s)", (r2["order_id"], s), role="authenticated", uid=owner)
    assert q("select customer_request_return(%s, null, 'TEST damaged clasp')", (r2["order_number"],), role="authenticated", uid=u, one=True)["status"] == "return_requested"
    r3 = place(pid, 1, uid=u)
    with pytest.raises(Exception, match="within"):
        q("select customer_request_return(%s, null, 'too early')", (r3["order_number"],), role="authenticated", uid=u)



def geo_q(sql, args, geo):
    c = conn()
    try:
        with c.cursor() as cur:
            cur.execute("begin")
            cur.execute("set local role anon")
            if geo:
                cur.execute("select set_config('request.headers', %s, true)", (json.dumps({"x-geo": geo}),))
            cur.execute(sql, args)
            r = cur.fetchone()[0]
            cur.execute("commit")
            return r
    finally:
        c.close()


def test_location_pricing_server_side():
    q("""update store_settings set value = '{"enabled": true, "lat": 26.9124, "lng": 75.7873, "radius_km": 10, "extra_amount": 50}' where key = 'location_pricing'""")
    try:
        assert q("select is_public from store_settings where key = 'location_pricing'", one=True) is False
        assert q("select count(*) from store_settings where key = 'location_pricing'", role="anon", one=True) == 0
        pid = new_product(stock=5, price=899)
        items = json.dumps([{"product_id": str(pid), "quantity": 2}])
        near = geo_q("select quote_cart(%s::jsonb)", (items,), "26.9200,75.8000")
        far = geo_q("select quote_cart(%s::jsonb)", (items,), "28.6139,77.2090")
        unknown = geo_q("select quote_cart(%s::jsonb)", (items,), None)
        spoof = geo_q("select quote_cart(%s::jsonb)", (items,), "not-a-location")
        assert float(near["lines"][0]["unit_price"]) == 899 and float(near["subtotal"]) == 1798
        assert float(far["lines"][0]["unit_price"]) == 949 and float(far["subtotal"]) == 1898
        assert float(unknown["subtotal"]) == 1898 and float(spoof["subtotal"]) == 1898
        assert geo_q("select price_zone()", (), "26.9200,75.8000") == {"enabled": True, "extra": 0}
        assert float(geo_q("select price_zone()", (), "28.6139,77.2090")["extra"]) == 50
        o = geo_q("select place_order(%s::jsonb, %s::jsonb, %s::jsonb, null, 'cod')", (json.dumps([{"product_id": str(pid), "quantity": 1}]), json.dumps(CONTACT), json.dumps(ADDR)), "28.6139,77.2090")
        row = q("select total, location_extra, customer_geo from orders where id = %s", (o["order_id"],))[0]
        assert float(row[1]) == 50 and row[2] == "28.6139,77.2090" and float(row[0]) == 949 + 79
    finally:
        q("""update store_settings set value = '{"enabled": false, "radius_km": 10, "extra_amount": 0}' where key = 'location_pricing'""")
