import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  supplierId: number | null;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("scm_user");
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });
  const [loading, setLoading] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem("scm_token");
    localStorage.removeItem("scm_user");
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener("scm:logout", logout);
    return () => window.removeEventListener("scm:logout", logout);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem("scm_token");
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp: number };
      const remaining = payload.exp * 1000 - Date.now();
      if (remaining <= 0) {
        logout();
        return;
      }
      const timer = window.setTimeout(logout, remaining);
      return () => window.clearTimeout(timer);
    } catch {
      logout();
    }
  }, [user, logout]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: AuthUser }>("/seguridad/login", {
        email,
        password,
      });
      localStorage.setItem("scm_token", data.token);
      localStorage.setItem("scm_user", JSON.stringify(data.user));
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      can: (...permissions) =>
        Boolean(user && permissions.some((permission) => user.permissions.includes(permission))),
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
