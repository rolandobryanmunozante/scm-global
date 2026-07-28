import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

interface RouterLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface RouterContextValue {
  location: RouterLocation;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);
const ParamsContext = createContext<Record<string, string>>({});

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const handleNavigation = () => setLocation(readLocation());
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const next = new URL(to, window.location.origin);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = `${next.pathname}${next.search}${next.hash}`;
    if (current === target) return;
    window.history[options?.replace ? "replaceState" : "pushState"]({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function RouteParams({
  params,
  children,
}: {
  params: Record<string, string>;
  children: ReactNode;
}) {
  return <ParamsContext.Provider value={params}>{children}</ParamsContext.Provider>;
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace }), [navigate, replace, to]);
  return null;
}

interface NavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
}

export function NavLink({ to, end = false, className, onClick, ...props }: NavLinkProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const targetPath = normalizePath(new URL(to, window.location.origin).pathname);
  const currentPath = normalizePath(pathname);
  const isActive =
    currentPath === targetPath || (!end && targetPath !== "/" && currentPath.startsWith(`${targetPath}/`));
  const resolvedClassName = typeof className === "function" ? className({ isActive }) : className;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };

  return <a {...props} href={to} className={resolvedClassName} onClick={handleClick} />;
}

export function useLocation(): RouterLocation {
  return useRouter().location;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useParams(): Record<string, string | undefined> {
  return useContext(ParamsContext);
}

export function matchRoute(
  pattern: string,
  pathname: string,
): { matched: boolean; params: Record<string, string> } {
  const patternSegments = normalizePath(pattern).split("/").filter(Boolean);
  const pathSegments = normalizePath(pathname).split("/").filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return { matched: false, params: {} };

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const segment = patternSegments[index]!;
    const value = pathSegments[index]!;
    if (segment.startsWith(":")) {
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        return { matched: false, params: {} };
      }
    } else if (segment !== value) {
      return { matched: false, params: {} };
    }
  }
  return { matched: true, params };
}

function useRouter(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) throw new Error("El enrutador debe envolver la aplicación");
  return context;
}

function readLocation(): RouterLocation {
  return {
    pathname: normalizePath(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash,
  };
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}
