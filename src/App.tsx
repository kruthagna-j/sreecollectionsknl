import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { StoreLayout, ScrollToTop } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { RequireStaff } from "./components/RequireStaff";
import { EmptyState, PageLoader } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import type { Role } from "./lib/types";

const Home = lazy(() => import("./pages/Home").then((module) => ({ default: module.Home })));
const Shop = lazy(() => import("./pages/Shop").then((module) => ({ default: module.Shop })));
const GiftFinder = lazy(() => import("./pages/GiftFinder").then((module) => ({ default: module.GiftFinder })));
const Product = lazy(() => import("./pages/Product").then((module) => ({ default: module.Product })));
const Cart = lazy(() => import("./pages/Cart").then((module) => ({ default: module.Cart })));
const Checkout = lazy(() => import("./pages/Checkout").then((module) => ({ default: module.Checkout })));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation").then((module) => ({ default: module.OrderConfirmation })));
const TrackOrder = lazy(() => import("./pages/TrackOrder").then((module) => ({ default: module.TrackOrder })));
const Faq = lazy(() => import("./pages/Faq").then((module) => ({ default: module.Faq })));
const Contact = lazy(() => import("./pages/Contact").then((module) => ({ default: module.Contact })));
const Offers = lazy(() => import("./pages/Offers").then((module) => ({ default: module.Offers })));
const Journal = lazy(() => import("./pages/Journal").then((module) => ({ default: module.Journal })));
const About = lazy(() => import("./pages/About").then((module) => ({ default: module.About })));
const VisitStore = lazy(() => import("./pages/VisitStore").then((module) => ({ default: module.VisitStore })));
const Policy = lazy(() => import("./pages/Policy").then((module) => ({ default: module.Policy })));
const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const Register = lazy(() => import("./pages/Register").then((module) => ({ default: module.Register })));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword").then((module) => ({ default: module.ForgotPassword })));
const NotFound = lazy(() => import("./pages/NotFound").then((module) => ({ default: module.NotFound })));

const AccountLayout = lazy(() => import("./pages/account/AccountLayout").then((module) => ({ default: module.AccountLayout })));
const AccountDashboard = lazy(() => import("./pages/account/Dashboard").then((module) => ({ default: module.AccountDashboard })));
const AccountOrders = lazy(() => import("./pages/account/Orders").then((module) => ({ default: module.AccountOrders })));
const AccountOrderDetail = lazy(() => import("./pages/account/OrderDetail").then((module) => ({ default: module.AccountOrderDetail })));
const AccountWishlist = lazy(() => import("./pages/account/Wishlist").then((module) => ({ default: module.AccountWishlist })));
const AccountAddresses = lazy(() => import("./pages/account/Addresses").then((module) => ({ default: module.AccountAddresses })));
const AccountReviews = lazy(() => import("./pages/account/Reviews").then((module) => ({ default: module.AccountReviews })));
const AccountReturns = lazy(() => import("./pages/account/Returns").then((module) => ({ default: module.AccountReturns })));
const AccountProfile = lazy(() => import("./pages/account/Profile").then((module) => ({ default: module.AccountProfile })));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard").then((module) => ({ default: module.AdminDashboard })));
const AdminProducts = lazy(() => import("./pages/admin/Products").then((module) => ({ default: module.AdminProducts })));
const AdminProductEditor = lazy(() => import("./pages/admin/ProductEditor").then((module) => ({ default: module.AdminProductEditor })));
const AdminCategories = lazy(() => import("./pages/admin/Categories").then((module) => ({ default: module.AdminCategories })));
const AdminOrders = lazy(() => import("./pages/admin/Orders").then((module) => ({ default: module.AdminOrders })));
const AdminOrderDetail = lazy(() => import("./pages/admin/OrderDetail").then((module) => ({ default: module.AdminOrderDetail })));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons").then((module) => ({ default: module.AdminCoupons })));
const AdminZones = lazy(() => import("./pages/admin/Zones").then((module) => ({ default: module.AdminZones })));
const AdminSettings = lazy(() => import("./pages/admin/Settings").then((module) => ({ default: module.AdminSettings })));
const AdminReviews = lazy(() => import("./pages/admin/Reviews").then((module) => ({ default: module.AdminReviews })));
const AdminTickets = lazy(() => import("./pages/admin/Tickets").then((module) => ({ default: module.AdminTickets })));
const AdminReturns = lazy(() => import("./pages/admin/Returns").then((module) => ({ default: module.AdminReturns })));
const AdminCustomers = lazy(() => import("./pages/admin/Customers").then((module) => ({ default: module.AdminCustomers })));
const AdminAudit = lazy(() => import("./pages/admin/Audit").then((module) => ({ default: module.AdminAudit })));
const AdminStockMovements = lazy(() => import("./pages/admin/StockMovements").then((module) => ({ default: module.AdminStockMovements })));

function AdminDenied() {
  return (
    <div className="admin-page">
      <EmptyState
        title="Not available for your role"
        description="This section belongs to a different store role. Ask the owner if you need access, or return to the section you use."
        action={{ label: "Back to admin", to: "/admin" }}
      />
    </div>
  );
}

function AdminGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  const allowed = user.role === "owner" || user.role === "admin" || roles.includes(user.role);
  return allowed ? <>{children}</> : <AdminDenied />;
}

function AdminHome() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "catalogue") return <Navigate to="/admin/products" replace />;
  if (user.role === "orders") return <Navigate to="/admin/orders" replace />;
  if (user.role === "support") return <Navigate to="/admin/reviews" replace />;
  return <AdminDashboard />;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader label="Opening the store…" />}>
        <Routes>
          <Route path="/" element={<StoreLayout />}>
            <Route index element={<Home />} />
            <Route path="shop" element={<Shop />} />
            <Route path="gift-finder" element={<GiftFinder />} />
            <Route path="product/:slug" element={<Product />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order/:orderNumber" element={<OrderConfirmation />} />
            <Route path="track" element={<TrackOrder />} />
            <Route path="faq" element={<Faq />} />
            <Route path="contact" element={<Contact />} />
            <Route path="offers" element={<Offers />} />
            <Route path="journal" element={<Journal />} />
            <Route path="about" element={<About />} />
            <Route path="stores" element={<VisitStore />} />
            <Route path="policies/:slug" element={<Policy />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AccountDashboard />} />
            <Route path="orders" element={<AccountOrders />} />
            <Route path="orders/:orderNumber" element={<AccountOrderDetail />} />
            <Route path="wishlist" element={<AccountWishlist />} />
            <Route path="addresses" element={<AccountAddresses />} />
            <Route path="reviews" element={<AccountReviews />} />
            <Route path="returns" element={<AccountReturns />} />
            <Route path="profile" element={<AccountProfile />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route
            path="/admin"
            element={
              <RequireStaff>
                <AdminLayout />
              </RequireStaff>
            }
          >
            <Route index element={<AdminHome />} />
            <Route
              path="products"
              element={
                <AdminGate roles={["catalogue"]}>
                  <AdminProducts />
                </AdminGate>
              }
            />
            <Route
              path="products/new"
              element={
                <AdminGate roles={["catalogue"]}>
                  <AdminProductEditor />
                </AdminGate>
              }
            />
            <Route
              path="products/:id"
              element={
                <AdminGate roles={["catalogue"]}>
                  <AdminProductEditor />
                </AdminGate>
              }
            />
            <Route
              path="categories"
              element={
                <AdminGate roles={["catalogue"]}>
                  <AdminCategories />
                </AdminGate>
              }
            />
            <Route
              path="stock"
              element={
                <AdminGate roles={["catalogue", "finance"]}>
                  <AdminStockMovements />
                </AdminGate>
              }
            />
            <Route
              path="orders"
              element={
                <AdminGate roles={["orders", "finance"]}>
                  <AdminOrders />
                </AdminGate>
              }
            />
            <Route
              path="orders/:id"
              element={
                <AdminGate roles={["orders", "finance"]}>
                  <AdminOrderDetail />
                </AdminGate>
              }
            />
            <Route
              path="returns"
              element={
                <AdminGate roles={["orders", "support"]}>
                  <AdminReturns />
                </AdminGate>
              }
            />
            <Route
              path="customers"
              element={
                <AdminGate roles={["orders", "finance", "support"]}>
                  <AdminCustomers />
                </AdminGate>
              }
            />
            <Route
              path="coupons"
              element={
                <AdminGate roles={[]}>
                  <AdminCoupons />
                </AdminGate>
              }
            />
            <Route
              path="reviews"
              element={
                <AdminGate roles={["support"]}>
                  <AdminReviews />
                </AdminGate>
              }
            />
            <Route
              path="tickets"
              element={
                <AdminGate roles={["support"]}>
                  <AdminTickets />
                </AdminGate>
              }
            />
            <Route
              path="zones"
              element={
                <AdminGate roles={[]}>
                  <AdminZones />
                </AdminGate>
              }
            />
            <Route
              path="settings"
              element={
                <AdminGate roles={["finance"]}>
                  <AdminSettings />
                </AdminGate>
              }
            />
            <Route
              path="audit"
              element={
                <AdminGate roles={["finance"]}>
                  <AdminAudit />
                </AdminGate>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
