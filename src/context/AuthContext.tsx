import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { User } from "../lib/types";

type LoginInput = { email: string; password: string };
type RegisterInput = { name: string; email: string; phone?: string; password: string };

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isStaff: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_ROLES = ["owner", "admin", "catalogue", "orders", "support", "finance"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: User | null }>("/auth/session"),
    staleTime: 60_000
  });

  const user = session.data?.user ?? null;
  const isStaff = Boolean(user && STAFF_ROLES.includes(user.role));

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: session.isLoading,
      isStaff,
      refresh: () => session.refetch(),
      login: async (input) => {
        const data = await api<{ user: User }>("/auth/login", { method: "POST", body: input });
        queryClient.setQueryData(["session"], { user: data.user });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["cart"] }),
          queryClient.invalidateQueries({ queryKey: ["account"] })
        ]);
        return data.user;
      },
      register: async (input) => {
        const data = await api<{ user: User }>("/auth/register", { method: "POST", body: input });
        queryClient.setQueryData(["session"], { user: data.user });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["cart"] }),
          queryClient.invalidateQueries({ queryKey: ["account"] })
        ]);
        return data.user;
      },
      logout: async () => {
        await api<{ ok: true }>("/auth/logout", { method: "POST" });
        queryClient.setQueryData(["session"], { user: null });
        queryClient.removeQueries({ queryKey: ["account"] });
        await queryClient.invalidateQueries({ queryKey: ["cart"] });
      }
    }),
    [user, isStaff, session, queryClient]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
