import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { classNames, initials } from "../../lib/format";
import { useSeo } from "../../lib/hooks";
import { CloseIcon, MenuIcon } from "../../components/Icons";
import { PageLoader } from "../../components/ui";
import type { Role } from "../../lib/types";

type NavItem = { to: string; label: string; end?: boolean; roles?: Role[] };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { title: "Overview", items: [{ to: "/admin", label: "Dashboard", end: true, roles: ["finance"] }] },
  {
    title: "Catalogue",
    items: [
      { to: "/admin/products", label: "Products", roles: ["catalogue"] },
      { to: "/admin/categories", label: "Categories", roles: ["catalogue"] },
      { to: "/admin/stock", label: "Stock movements", roles: ["catalogue", "finance"] }
    ]
  },
  {
    title: "Sales",
    items: [
      { to: "/admin/orders", label: "Orders", roles: ["orders", "finance"] },
      { to: "/admin/returns", label: "Returns", roles: ["orders", "support"] },
      { to: "/admin/customers", label: "Customers", roles: ["orders", "finance", "support"] },
      { to: "/admin/coupons", label: "Coupons", roles: [] }
    ]
  },
  {
    title: "Service",
    items: [
      { to: "/admin/reviews", label: "Reviews", roles: ["support"] },
      { to: "/admin/tickets", label: "Support tickets", roles: ["support"] }
    ]
  },
  {
    title: "Store",
    items: [
      { to: "/admin/zones", label: "Delivery zones", roles: [] },
      { to: "/admin/settings", label: "Settings", roles: ["finance"] },
      { to: "/admin/audit", label: "Audit log", roles: ["finance"] }
    ]
  }
];

export function canSee(item: NavItem, role: Role | undefined): boolean {
  if (!role) return false;
  if (role === "owner" || role === "admin") return true;
  return Boolean(item.roles?.includes(role));
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useSeo({ title: "Store admin · Sree Collections", noIndex: true, description: "Internal store administration." });

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item, user?.role))
  })).filter((group) => group.items.length);

  const signOut = async () => {
    try {
      await logout();
      navigate("/", { replace: true });
    } catch {
      notify("Could not sign out. Please try again.", "error");
    }
  };

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={menuOpen ? "admin-sidebar is-open" : "admin-sidebar"}>
        <div className="admin-sidebar__head">
          <Link to="/admin" className="admin-brand">
            <span className="admin-brand__mark">SC</span>
            <span>
              <strong>Store admin</strong>
              <small>Sree Collections</small>
            </span>
          </Link>
          <button type="button" className="icon-button admin-sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <CloseIcon size={17} />
          </button>
        </div>
        <nav className="admin-nav" aria-label="Admin sections" onClick={() => setMenuOpen(false)}>
          {groups.map((group) => (
            <div key={group.title} className="admin-nav__group">
              <p>{group.title}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => classNames("admin-nav__link", isActive && "is-active")}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar__foot">
          <Link to="/" className="admin-nav__link">
            View storefront
          </Link>
          <button type="button" className="admin-nav__link admin-nav__link--button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      {menuOpen ? <button type="button" className="admin-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}

      <div className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="icon-button admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <MenuIcon size={19} />
          </button>
          <div className="admin-topbar__title">
            <span>Store operations</span>
            {user?.role === "owner" || user?.role === "admin" ? <span className="pill pill--soft">Full access</span> : null}
          </div>
          <div className="admin-user">
            <span className="admin-user__avatar">{initials(user?.name ?? "S")}</span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role}</small>
            </div>
          </div>
        </header>
        <main className="admin-content" id="main">
          <Suspense fallback={<PageLoader label="Loading…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
