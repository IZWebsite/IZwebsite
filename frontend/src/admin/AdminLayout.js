import { NavLink, Outlet, Link } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Gem, FolderTree, Megaphone, Users, Settings, BarChart3 } from "lucide-react";
import { useAuth, can } from "../context/AuthContext";
import { useSeo } from "../lib/seo";

const NAV = [
  ["", "Overview", LayoutDashboard, "view"], ["orders", "Orders", ShoppingCart, "orders"], ["products", "Products", Gem, "products"],
  ["catalog", "Categories & offers", FolderTree, "products"], ["content", "Website content", Megaphone, "content"],
  ["customers", "Customers", Users, "customers"], ["analytics", "Traffic", BarChart3, "view"], ["settings", "Settings", Settings, "view"],
];

export default function AdminLayout() {
  const { user, role, loading, signOut } = useAuth();
  useSeo({ title: "Admin", noindex: true });
  if (loading) return <div className="h-screen" />;
  if (!user || !role) return (
    <div className="min-h-screen grid place-items-center p-6 text-center" data-testid="admin-no-access">
      <div><h1 className="font-display text-3xl mb-3">Staff access only</h1><p className="text-sm text-muted-foreground mb-6">{user ? "Your account does not have an admin role. Ask the store owner to grant access." : "Please log in with your staff account."}</p><Link to={user ? "/" : "/login?next=/admin"} className="btn-primary">{user ? "Back to store" : "Log in"}</Link></div>
    </div>
  );
  const items = NAV.filter((n) => can(role, n[3]));
  return (
    <div className="min-h-screen bg-secondary/40 lg:grid lg:grid-cols-[240px_1fr]" data-testid="admin-layout">
      <aside className="hidden lg:flex flex-col bg-[#2b2420] text-[#efe6d8] p-6 sticky top-0 h-screen no-print">
        <Link to="/" className="font-display text-2xl tracking-[0.2em] mb-1">IMINATIONZ</Link>
        <p className="text-[11px] uppercase tracking-widest opacity-60 mb-10">Admin · {role}</p>
        <nav className="flex flex-col gap-1 flex-1">{items.map(([to, l, I]) => (
          <NavLink key={to} end={to === ""} to={`/admin/${to}`} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm ${isActive ? "bg-white/10" : "opacity-75 hover:opacity-100"}`} data-testid={`admin-nav-${to || "overview"}`}><I size={16} strokeWidth={1.5} />{l}</NavLink>
        ))}</nav>
        <button onClick={signOut} className="text-xs opacity-60 hover:opacity-100 text-left" data-testid="admin-logout-btn">Log out ({user.email})</button>
      </aside>
      <div className="min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-[#2b2420] text-[#efe6d8] no-print">
          <div className="flex items-center justify-between px-4 h-14"><Link to="/" className="font-display text-xl tracking-[0.2em]">IMINATIONZ</Link><span className="text-[10px] uppercase tracking-widest opacity-70">{role}</span></div>
          <nav className="flex overflow-x-auto no-scrollbar px-2 pb-2 gap-1">{items.map(([to, l, I]) => (
            <NavLink key={to} end={to === ""} to={`/admin/${to}`} className={({ isActive }) => `flex items-center gap-1.5 px-3 h-10 text-xs whitespace-nowrap ${isActive ? "bg-white/15" : "opacity-75"}`} data-testid={`admin-mnav-${to || "overview"}`}><I size={14} />{l}</NavLink>
          ))}</nav>
        </header>
        <main className="p-4 md:p-8 max-w-[1400px]"><Outlet /></main>
      </div>
    </div>
  );
}
