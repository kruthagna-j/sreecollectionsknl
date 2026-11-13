import { Suspense, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSite } from "../context/SiteContext";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { LogoMark, MailIcon } from "./Icons";
import { PageLoader } from "./ui";

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function MaintenanceScreen({ message, storeName }: { message: string; storeName: string }) {
  const { site } = useSite();
  return (
    <main className="maintenance-screen" id="main">
      <div className="maintenance-screen__inner">
        <LogoMark size={54} />
        <p className="eyebrow">A short pause</p>
        <h1>{storeName} is being tended to.</h1>
        <p>{message || "The store is temporarily unavailable while we make a few updates. Please return shortly."}</p>
        <div className="maintenance-screen__actions">
          {site?.store.supportEmail ? (
            <a className="button button--primary" href={`mailto:${site.store.supportEmail}`}>
              <MailIcon size={16} /> Email the store
            </a>
          ) : (
            <Link className="button button--primary" to="/contact">
              Contact the store
            </Link>
          )}
          <Link className="button button--quiet" to="/admin">
            Store team sign in
          </Link>
        </div>
        <p className="maintenance-screen__fine">Existing orders are not affected. The store team can still access the dashboard.</p>
      </div>
    </main>
  );
}

export function StoreLayout() {
  const { site, isLoading, isError } = useSite();
  const { isStaff } = useAuth();

  if (!isLoading && site?.operational.maintenance && !isStaff) {
    return <MaintenanceScreen message={site.operational.message} storeName={site.store.name || "Sree Collections"} />;
  }

  return (
    <div className="app-shell">
      <Header />
      {isError && !isLoading ? (
        <p className="site-warning" role="status">
          Store details could not be refreshed, so prices, delivery and contact information shown here may be out of date.
          Please <Link to="/contact">contact the shop</Link> before placing an order.
        </p>
      ) : null}
      <main id="main" className="site-main">
        {/* Inside the shell on purpose: a slow route chunk replaces only the page, not the header,
            footer and navigation the shopper was already looking at. */}
        <Suspense fallback={<PageLoader label="Loading this page…" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
