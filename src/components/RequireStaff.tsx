import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageLoader } from "./ui";

export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, isLoading, isStaff } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader label="Checking store access…" />;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!isStaff) return <Navigate to="/account" replace />;
  return <>{children}</>;
}
