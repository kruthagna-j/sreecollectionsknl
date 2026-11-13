import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { HomeInfo, SiteInfo } from "../lib/types";

type SiteContextValue = {
  site: SiteInfo | null;
  home: HomeInfo | null;
  isLoading: boolean;
  isError: boolean;
};

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const site = useQuery({
    queryKey: ["site"],
    queryFn: () => api<SiteInfo>("/content/site"),
    staleTime: 5 * 60_000
  });
  const home = useQuery({
    queryKey: ["home"],
    queryFn: () => api<HomeInfo>("/content/home"),
    staleTime: 2 * 60_000
  });

  return (
    <SiteContext.Provider
      value={{
        site: site.data ?? null,
        home: home.data ?? null,
        isLoading: site.isLoading || home.isLoading,
        isError: site.isError || home.isError
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSite(): SiteContextValue {
  const context = useContext(SiteContext);
  if (!context) throw new Error("useSite must be used inside SiteProvider");
  return context;
}
