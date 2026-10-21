import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import LocationGate, { LocatingOverlay } from "./components/LocationGate";
import { StoreProvider } from "./context/StoreContext";
import { AuthProvider } from "./context/AuthContext";
import { ShopProvider } from "./context/ShopContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderPage from "./pages/OrderPage";
import Auth from "./pages/Auth";
import Account from "./pages/Account";
import { InfoPage, Track, NotFound } from "./pages/Misc";

const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const Overview = lazy(() => import("./admin/Overview"));
const Analytics = lazy(() => import("./admin/Analytics"));
const AdminOrders = lazy(() => import("./admin/Orders").then((m) => ({ default: m.Orders })));
const AdminOrderDetail = lazy(() => import("./admin/Orders").then((m) => ({ default: m.OrderDetail })));
const Products = lazy(() => import("./admin/Products").then((m) => ({ default: m.Products })));
const ProductEdit = lazy(() => import("./admin/Products").then((m) => ({ default: m.ProductEdit })));
const Catalog = lazy(() => import("./admin/Catalog"));
const Content = lazy(() => import("./admin/Content"));
const Customers = lazy(() => import("./admin/Customers"));
const Settings = lazy(() => import("./admin/Settings"));

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <AuthProvider>
          <ShopProvider>
            <Suspense fallback={<div className="h-screen" />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/shop" element={<Shop />} />
                  <Route path="/product/:slug" element={<Product />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/order/:number" element={<OrderPage />} />
                  <Route path="/login" element={<Auth />} />
                  <Route path="/register" element={<Auth />} />
                  <Route path="/reset-password" element={<Auth />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/track" element={<Track />} />
                  <Route path="/pages/:slug" element={<InfoPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Overview />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="orders/:id" element={<AdminOrderDetail />} />
                  <Route path="products" element={<Products />} />
                  <Route path="products/:id" element={<ProductEdit />} />
                  <Route path="catalog" element={<Catalog />} />
                  <Route path="content" element={<Content />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
            </Suspense>
            <Toaster position="top-center" richColors />
            <LocationGate />
            <LocatingOverlay />
          </ShopProvider>
        </AuthProvider>
      </StoreProvider>
    </BrowserRouter>
  );
}
