import { Link } from "react-router-dom";
import { LogoMark } from "../components/Icons";
import { useSeo } from "../lib/hooks";

export function NotFound() {
  useSeo({ title: "Page not found · Sree Collections", noIndex: true, description: "This page could not be found." });

  return (
    <div className="container page-shell not-found">
      <LogoMark size={56} />
      <p className="eyebrow">404</p>
      <h1>This shelf is empty</h1>
      <p>The page you are looking for has moved or never existed. The collection, however, is still here.</p>
      <div className="not-found__actions">
        <Link to="/" className="button button--primary">
          Back to the store
        </Link>
        <Link to="/shop" className="button button--quiet">
          Browse gifts
        </Link>
      </div>
      <div className="not-found__links">
        <Link to="/track">Track an order</Link>
        <Link to="/contact">Contact us</Link>
        <Link to="/faq">FAQs</Link>
      </div>
    </div>
  );
}
