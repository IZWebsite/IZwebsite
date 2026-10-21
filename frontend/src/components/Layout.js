import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Heart, Menu, Search, ShoppingBag, User, X, Instagram, Facebook, Youtube, MessageCircle, Minus, Plus, Home, LayoutGrid, ArrowUp } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { useStore } from "../context/StoreContext";
import { useShop } from "../context/ShopContext";
import { useAuth } from "../context/AuthContext";
import { getConsent, setConsent, usePageView } from "../lib/analytics";
import { inr } from "../lib/format";

export const Logo = ({ className = "" }) => {
  const { settings } = useStore();
  const b = settings.brand || {};
  return b.logo_url
    ? <img src={b.logo_url} alt={b.name || "IMINATIONZ"} className={`h-12 md:h-16 w-auto max-w-[200px] object-contain ${className}`} />
    : <span className={`font-display text-2xl md:text-[28px] tracking-[0.22em] ${className}`}>{b.name || "IMINATIONZ"}</span>;
};

function Announcement() {
  const { settings } = useStore();
  const a = settings.announcement;
  if (!a?.enabled || !a.text) return null;
  return (
    <div className="bg-primary text-primary-foreground text-[12px] tracking-[0.12em] text-center py-2 px-4" data-testid="announcement-bar">
      {!a.link ? a.text : a.link.startsWith("/") ? <Link to={a.link} className="hover:opacity-80">{a.text}</Link>
        : <a href={/^https?:\/\//.test(a.link) ? a.link : `https://${a.link}`} target="_blank" rel="noreferrer" className="hover:opacity-80">{a.text}</a>}
    </div>
  );
}

const NAV = [["Shop all", "/shop"], ["New In", "/shop?sort=newest"], ["Bestsellers", "/shop?sort=popular"], ["Earrings", "/shop?category=earrings"], ["Necklaces", "/shop?category=necklaces"], ["Anti-Tarnish", "/shop?collection=anti-tarnish"], ["Festive", "/shop?collection=festive"]];

function Header() {
  const { count, setCartOpen } = useShop();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const nav = useNavigate();
  const submit = (e) => { e.preventDefault(); if (q.trim()) { nav(`/shop?q=${encodeURIComponent(q.trim())}`); setSearchOpen(false); setOpen(false); } };
  useEffect(() => {
    const h = () => { setSearchOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener("imz:search", h);
    return () => window.removeEventListener("imz:search", h);
  }, []);
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="container-x h-16 md:h-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center min-w-0">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setOpen(true)} aria-label="Open menu" data-testid="mobile-menu-btn"><Menu size={22} strokeWidth={1.5} /></button>
          <nav className="hidden lg:flex flex-wrap items-center gap-x-6 gap-y-1 text-[14px]">
            {NAV.map(([l, to]) => <NavLink key={l} to={to} className="hover:text-[color:var(--gold)] transition-colors whitespace-nowrap" data-testid={`nav-${l.toLowerCase().replace(/\s+/g, "-")}`}>{l}</NavLink>)}
          </nav>
        </div>
        <Link to="/" data-testid="header-logo" className="justify-self-center"><Logo /></Link>
        <div className="flex items-center justify-end gap-0.5 md:gap-2">
          <button className="p-2" onClick={() => setSearchOpen((v) => !v)} aria-label="Search" data-testid="header-search-btn"><Search size={19} strokeWidth={1.5} /></button>
          <Link to="/account?tab=wishlist" className="p-2 hidden sm:block" aria-label="Wishlist" data-testid="header-wishlist-link"><Heart size={19} strokeWidth={1.5} /></Link>
          <Link to={user ? "/account" : "/login"} className="p-2 hidden sm:block" aria-label="Account" data-testid="header-account-link"><User size={19} strokeWidth={1.5} /></Link>
          <button className="p-2 relative" onClick={() => setCartOpen(true)} aria-label="Bag" data-testid="header-cart-btn">
            <ShoppingBag size={19} strokeWidth={1.5} />
            {count > 0 && <span className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-1 text-[10px] bg-[color:var(--gold)] text-white rounded-full grid place-items-center" data-testid="cart-count">{count}</span>}
          </button>
        </div>
      </div>
      {searchOpen && (
        <form onSubmit={submit} className="container-x pb-4 reveal" data-testid="header-search-form">
          <input autoFocus className="input" placeholder="Search jhumkas, rings, SKU…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="header-search-input" />
        </form>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-background w-[86vw] max-w-sm">
          <SheetTitle className="font-display text-2xl tracking-[0.2em] mb-8">MENU</SheetTitle>
          <form onSubmit={submit} className="mb-6"><input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} data-testid="mobile-search-input" /></form>
          <nav className="flex flex-col gap-5 text-lg font-display">
            {NAV.map(([l, to]) => <Link key={l} to={to} onClick={() => setOpen(false)}>{l}</Link>)}
            <Link to="/account?tab=wishlist" onClick={() => setOpen(false)}>Wishlist</Link>
            <Link to="/track" onClick={() => setOpen(false)}>Track order</Link>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function CartDrawer() {
  const { items, cartOpen, setCartOpen, setQty, remove, estimate } = useShop();
  const nav = useNavigate();
  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent side="right" className="bg-background w-full sm:max-w-md flex flex-col p-0" data-testid="cart-drawer">
        <div className="p-6 border-b"><SheetTitle className="font-display text-2xl">Your Bag</SheetTitle></div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!items.length && <p className="text-sm text-muted-foreground" data-testid="cart-drawer-empty">Your bag is empty.</p>}
          {items.map((i) => (
            <div key={`${i.product_id}${i.variant_id}`} className="flex gap-4" data-testid="cart-drawer-item">
              <img src={i.image_url || "/demo/set.jpg"} alt={i.name} className="w-20 h-24 object-cover bg-muted" />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">{i.name}</p>
                {i.variant_name && <p className="text-xs text-muted-foreground">{i.variant_name}</p>}
                <p className="text-sm mt-1">{inr(i.price)}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center border">
                    <button className="p-1.5" onClick={() => setQty(i, i.quantity - 1)} aria-label="Decrease"><Minus size={12} /></button>
                    <span className="w-7 text-center text-sm">{i.quantity}</span>
                    <button className="p-1.5" onClick={() => setQty(i, i.quantity + 1)} aria-label="Increase"><Plus size={12} /></button>
                  </div>
                  <button className="text-xs link-u text-muted-foreground" onClick={() => remove(i)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="p-6 border-t space-y-3">
            <div className="flex justify-between text-sm"><span>Estimated subtotal</span><span data-testid="cart-drawer-subtotal">{inr(estimate)}</span></div>
            <p className="text-xs text-muted-foreground">Final prices, discounts and shipping are confirmed at checkout.</p>
            <button className="btn-primary w-full" onClick={() => { setCartOpen(false); nav("/cart"); }} data-testid="cart-drawer-checkout-btn">View bag & checkout</button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Footer() {
  const { settings } = useStore();
  const c = settings.contact || {};
  const b = settings.brand || {};
  const socials = [[c.instagram, Instagram, "Instagram"], [c.facebook, Facebook, "Facebook"], [c.youtube, Youtube, "YouTube"]].filter((s) => s[0]);
  return (
    <footer className="bg-[#2b2420] text-[#efe6d8] mt-24" data-testid="site-footer">
      <div className="container-x py-16 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <p className="font-display text-3xl tracking-[0.2em]">{b.name || "IMINATIONZ"}</p>
          <p className="font-display italic text-lg mt-3 text-[color:var(--champagne)]">{b.tagline}</p>
          <div className="flex gap-4 mt-6">{socials.map(([u, I, l]) => <a key={l} href={u} target="_blank" rel="noreferrer" aria-label={l}><I size={18} strokeWidth={1.4} /></a>)}</div>
        </div>
        <div><p className="eyebrow mb-4">Shop</p><ul className="space-y-2 text-sm opacity-80"><li><Link to="/shop">All jewellery</Link></li><li><Link to="/shop?collection=anti-tarnish">Anti-tarnish</Link></li><li><Link to="/shop?collection=festive">Festive</Link></li><li><Link to="/track">Track your order</Link></li></ul></div>
        <div><p className="eyebrow mb-4">Help</p><ul className="space-y-2 text-sm opacity-80">
          {["shipping", "returns", "cancellation", "care", "faq", "privacy", "terms"].map((k) => <li key={k}><Link to={`/pages/${k}`}>{settings.pages?.[k]?.title || { shipping: "Shipping", returns: "Returns & refunds", cancellation: "Cancellation", care: "Jewellery care", faq: "FAQ", privacy: "Privacy policy", terms: "Terms" }[k]}</Link></li>)}
        </ul></div>
        <div><p className="eyebrow mb-4">Contact</p><ul className="space-y-2 text-sm opacity-80">{[c.email, c.phone, c.hours].filter(Boolean).map((x) => <li key={x}>{x}</li>)}<li><Link to="/pages/contact">Contact us</Link></li><li><Link to="/pages/about">About us</Link></li></ul></div>
      </div>
      <div className="border-t border-white/10 py-6 text-center text-xs opacity-60">© {new Date().getFullYear()} {b.name || "IMINATIONZ"}. All prices in INR.</div>
    </footer>
  );
}

function WhatsAppFloat() {
  const { settings } = useStore();
  const n = (settings.contact?.whatsapp || "").replace(/\D/g, "");
  if (!n) return null;
  return (
    <a href={`https://wa.me/${n}?text=${encodeURIComponent("Hi IMINATIONZ, I have a question")}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"
      className="fixed bottom-36 lg:bottom-20 right-4 lg:right-5 z-40 p-3.5 rounded-full bg-[#25D366] text-white shadow-lg hover:scale-105 transition-transform" data-testid="whatsapp-float-btn">
      <MessageCircle size={24} />
    </a>
  );
}

function ConsentBanner() {
  const [show, setShow] = useState(!getConsent());
  if (!show) return null;
  const pick = (v) => { setConsent(v); setShow(false); };
  return (
    <div className="fixed bottom-16 lg:bottom-0 inset-x-0 z-50 bg-card border-t p-4 md:p-5 reveal" data-testid="consent-banner">
      <div className="container-x flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <p className="text-sm flex-1">We use first-party analytics (no ads, no third-party trackers) to understand which pieces you love. <Link to="/pages/privacy" className="link-u">Privacy policy</Link></p>
        <div className="flex gap-2"><button className="btn-outline h-9" onClick={() => pick("denied")} data-testid="consent-decline-btn">Decline</button><button className="btn-primary h-9" onClick={() => pick("granted")} data-testid="consent-accept-btn">Accept</button></div>
      </div>
    </div>
  );
}

function BottomNav() {
  const { count, setCartOpen } = useShop();
  const { user } = useAuth();
  const cls = "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider";
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-background/95 backdrop-blur-md border-t flex divide-x" data-testid="mobile-bottom-nav">
      <NavLink to="/" end className={cls} data-testid="bottom-nav-home"><Home size={19} strokeWidth={1.5} />Home</NavLink>
      <NavLink to="/shop" className={cls} data-testid="bottom-nav-shop"><LayoutGrid size={19} strokeWidth={1.5} />Shop</NavLink>
      <button className={`${cls} relative`} onClick={() => setCartOpen(true)} data-testid="bottom-nav-cart"><ShoppingBag size={19} strokeWidth={1.5} />Bag{count > 0 && <span className="absolute top-2 left-1/2 ml-2 h-4 min-w-4 px-1 text-[9px] bg-[color:var(--gold)] text-white rounded-full grid place-items-center">{count}</span>}</button>
      <button className={cls} onClick={() => window.dispatchEvent(new Event("imz:search"))} data-testid="bottom-nav-search"><Search size={19} strokeWidth={1.5} />Search</button>
      <NavLink to={user ? "/account" : "/login"} className={cls} data-testid="bottom-nav-account"><User size={19} strokeWidth={1.5} />Account</NavLink>
    </nav>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  if (!show) return null;
  return <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top" className="fixed bottom-20 lg:bottom-5 right-4 lg:right-5 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg hover:bg-[color:var(--gold)] transition-colors reveal" data-testid="back-to-top-btn"><ArrowUp size={18} /></button>;
}

function SetupNotice() {
  return (
    <div className="container-x py-24 max-w-2xl" data-testid="setup-notice">
      <p className="eyebrow mb-3">Store setup pending</p>
      <h1 className="font-display text-4xl mb-4">The database isn't set up yet</h1>
      <p className="text-muted-foreground">Run the SQL files in <code>supabase/migrations</code> (0001 → 0003) in your Supabase SQL editor, then reload this page. See README → "Supabase setup".</p>
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const { ready, setupMissing, settings } = useStore();
  const { isStaff } = useAuth();
  usePageView(pathname);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const maint = settings.maintenance?.enabled && !isStaff;
  return (
    <div className="min-h-screen flex flex-col pb-16 lg:pb-0">
      <Announcement />
      <Header />
      <main className="flex-1">
        {!ready ? <div className="h-[60vh]" /> : setupMissing ? <SetupNotice /> : maint
          ? <div className="container-x py-32 text-center" data-testid="maintenance-notice"><h1 className="font-display text-4xl mb-3">We'll be right back</h1><p className="text-muted-foreground">{settings.maintenance.message}</p></div>
          : <Outlet />}
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppFloat />
      <BackToTop />
      <BottomNav />
      <ConsentBanner />
    </div>
  );
}

export { X };
