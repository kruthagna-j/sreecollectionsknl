import { Suspense } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Breadcrumbs, PageLoader } from "../../components/ui";
import { LogoMark } from "../../components/Icons";
import { classNames, initials } from "../../lib/format";
import { useSeo } from "../../lib/hooks";

const links = [
  { to: "/account", label: "Overview", end: true },
  { to: "/account/orders", label: "Orders" },
  { to: "/account/wishlist", label: "Wishlist" },
  { to: "/account/addresses", label: "Addresses" },
  { to: "/account/reviews", label: "Reviews" },
  { to: "/account/returns", label: "Returns" },
  { to: "/account/profile", label: "Profile & security" }
];

export function AccountLayout() {
  const { user, logout, isStaff } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  useSeo({ title: "Your account · Sree Collections", noIndex: true, description: "Your Sree Collections account." });

  const signOut = async () => {
    try {
      await logout();
      notify("Signed out.", "info");
      navigate("/", { replace: true });
    } catch {
      notify("We could not sign you out. Please try again.", "error");
    }
  };

  return (
    <div className="container page-shell account-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Account" }]} />
      <div className="account-grid">
        <aside className="account-sidebar">
          <div className="account-identity">
            <span className="account-avatar">{initials(user?.name ?? "S")}</span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
          <nav className="account-nav" aria-label="Account">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => classNames("account-nav__link", isActive && "is-active")}
              >
                {link.label}
              </NavLink>
            ))}
            {isStaff ? (
              <NavLink to="/admin" className="account-nav__link account-nav__link--admin">
                <LogoMark size={18} /> Store admin
              </NavLink>
            ) : null}
          </nav>
          <button type="button" className="text-button account-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </aside>
        <main className="account-main" id="main">
          <Suspense fallback={<PageLoader label="Loading…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
