import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  authVersion: number;
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
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("scm_token")));
  const lastActivity = useRef(Date.now());

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
    if (!token) {
      setLoading(false);
      if (user) logout();
      return;
    }
    let active = true;
    void api
      .get<{ user: AuthUser }>("/seguridad/me")
      .then(({ data }) => {
        if (!active) return;
        storeSession(token, data.user);
        setUser(data.user);
      })
      .catch(() => {
        if (active) logout();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // La validación inicial se ejecuta una sola vez; los cambios posteriores se controlan por refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    const markActivity = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));

    let refreshing = false;
    const monitor = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= 30 * 60 * 1000) {
        logout();
        return;
      }
      const token = localStorage.getItem("scm_token");
      const expiresAt = tokenExpiry(token);
      if (!expiresAt || expiresAt <= Date.now()) {
        logout();
        return;
      }
      if (expiresAt - Date.now() < 10 * 60 * 1000 && !refreshing) {
        refreshing = true;
        void api
          .post<{ token: string; user: AuthUser }>("/seguridad/refresh")
          .then(({ data }) => {
            storeSession(data.token, data.user);
            setUser(data.user);
          })
          .catch(() => logout())
          .finally(() => {
            refreshing = false;
          });
      }
    }, 30_000);

    return () => {
      window.clearInterval(monitor);
      events.forEach((event) => window.removeEventListener(event, markActivity));
    };
  }, [user, logout]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: AuthUser }>("/seguridad/login", {
        email,
        password,
      });
      storeSession(data.token, data.user);
      lastActivity.current = Date.now();
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

function readStoredUser(): AuthUser | null {
  const token = localStorage.getItem("scm_token");
  const stored = localStorage.getItem("scm_user");
  if (!token || !stored || !tokenExpiry(token)) return null;
  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    localStorage.removeItem("scm_token");
    localStorage.removeItem("scm_user");
    return null;
  }
}

function tokenExpiry(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function storeSession(token: string, user: AuthUser): void {
  localStorage.setItem("scm_token", token);
  localStorage.setItem("scm_user", JSON.stringify(user));
}
