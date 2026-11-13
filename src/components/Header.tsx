import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSite } from "../context/SiteContext";
import { initials } from "../lib/format";
import { useEscape, useLockBody } from "../lib/hooks";
import { BagIcon, CloseIcon, GiftIcon, LockIcon, LogoMark, MenuIcon, SearchIcon, UserIcon } from "./Icons";
import { SearchOverlay } from "./SearchOverlay";
import { CartDrawer } from "./CartDrawer";

const NAV = [
  { label: "Shop all", to: "/shop" },
  { label: "Birthday", to: "/shop?category=birthday" },
  { label: "Anniversary", to: "/shop?category=anniversary" },
  { label: "Personalised", to: "/shop?category=personalised" },
  { label: "Wedding", to: "/shop?category=wedding" },
  { label: "Gift finder", to: "/gift-finder" }
];

export function Header() {
  const { site, home } = useSite();
  const { cart, openCart, closeCart } = useCart();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useLockBody(menuOpen);
  useEscape(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    closeCart();
  }, [location.pathname, location.search, closeCart]);

  const storeName = site?.store.name ?? "Sree Collections";
  const tagline = site?.store.tagline ?? "Since 1998";
  const announcement = home?.announcement || "Thoughtful gifts, chosen with care · Cash on delivery available";
  const count = cart?.itemCount ?? 0;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        <p>{announcement}</p>
        <Link to="/track" className="announcement__link">
          Track an order
        </Link>
      </div>
      <header className="site-header">
        <div className="site-header__inner">
          <button type="button" className="icon-button site-header__menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <MenuIcon size={22} />
          </button>

          <Link to="/" className="brand" aria-label={`${storeName} home`}>
            <LogoMark size={38} className="brand__mark" />
            <span className="brand__text">
              <span className="brand__name">{storeName}</span>
              <span className="brand__tagline">{tagline}</span>
            </span>
          </Link>

          <nav className="site-nav" aria-label="Main navigation">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive && item.to === "/shop" ? "is-active" : undefined)}
                end={item.to === "/shop"}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            <button type="button" className="icon-button" onClick={() => setSearchOpen(true)} aria-label="Search products">
              <SearchIcon size={20} />
            </button>
            <Link to={user ? "/account" : "/login"} className="icon-button account-link" aria-label={user ? "Your account" : "Sign in"}>
              {user ? <span className="account-link__initial">{initials(user.name)}</span> : <UserIcon size={20} />}
            </Link>
            <button type="button" className="icon-button bag-button" onClick={openCart} aria-label={`Open bag with ${count} items`}>
              <BagIcon size={20} />
              {count > 0 ? <span className="bag-button__count">{count}</span> : null}
            </button>
          </div>
        </div>
      </header>

      <div className={menuOpen ? "mobile-menu is-open" : "mobile-menu"} aria-hidden={!menuOpen} inert={!menuOpen ? true : undefined}>
        <div className="mobile-menu__top">
          <Link to="/" className="brand brand--mobile" onClick={() => setMenuOpen(false)}>
            <LogoMark size={34} />
            <span className="brand__name">{storeName}</span>
          </Link>
          <button type="button" className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <CloseIcon size={22} />
          </button>
        </div>
        <nav className="mobile-menu__nav" aria-label="Mobile navigation">
          <p className="eyebrow">Explore</p>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}>
              {item.label}
              <span aria-hidden="true">→</span>
            </Link>
          ))}
          <p className="eyebrow">Your account</p>
          <Link to={user ? "/account" : "/login"} onClick={() => setMenuOpen(false)}>
            {user ? "Your account" : "Sign in / Create account"}
            <UserIcon size={17} />
          </Link>
          <Link to="/track" onClick={() => setMenuOpen(false)}>
            Track an order
          </Link>
          <Link to="/stores" onClick={() => setMenuOpen(false)}>
            Visit the store
          </Link>
          <Link to="/contact" onClick={() => setMenuOpen(false)}>
            Contact &amp; help
          </Link>
        </nav>
        <div className="mobile-menu__foot">
          <p>
            <GiftIcon size={15} /> Gift wrapping available at checkout.
          </p>
          {site?.store.supportEmail ? <a href={`mailto:${site.store.supportEmail}`}>{site.store.supportEmail}</a> : null}
          <Link to="/admin" className="mobile-menu__staff" onClick={() => setMenuOpen(false)}>
            <LockIcon size={14} /> Staff sign in
          </Link>
        </div>
      </div>
      {menuOpen ? <div className="mobile-menu__backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer />
    </>
  );
}
