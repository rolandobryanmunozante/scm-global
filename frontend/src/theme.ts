import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function getPreferredTheme(): Theme {
  const stored = window.localStorage.getItem("scm_theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function initializeTheme(): void {
  applyTheme(getPreferredTheme());
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem("scm_theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );
  return { theme, toggleTheme };
}
