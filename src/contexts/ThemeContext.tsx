// src/contexts/ThemeContext.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_THEME,
  fetchUserTheme,
  persistUserTheme,
  ThemeMode,
} from "../services/userPreferences";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  darkMode: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  if (mode === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function resolveStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {}

  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);
  const themeRef = useRef(theme);
  const lastChangeOriginRef = useRef<"user" | "local" | "remote" | null>(null);
  const hasHydratedFromLocalRef = useRef(false);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // Hydrate from localStorage once the app is mounted on the client
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTheme = resolveStoredTheme();
    hasHydratedFromLocalRef.current = true;
    lastChangeOriginRef.current = "local";
    applyTheme(storedTheme);
    setThemeState(storedTheme);
  }, []);

  // Whenever theme changes, apply to DOM, sync localStorage, and persist if user initiated
  useEffect(() => {
    if (!hasHydratedFromLocalRef.current) {
      return;
    }

    applyTheme(theme);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("theme", theme);
      } catch (error) {
        console.error("Failed to write theme to localStorage:", error);
      }
    }

    if (user?.uid && lastChangeOriginRef.current === "user") {
      persistUserTheme(user.uid, theme).catch((error) => {
        console.error("Failed to persist user theme:", error);
      });
    }

    lastChangeOriginRef.current = null;
  }, [theme, user?.uid]);

  // When the authenticated user changes, load their saved preference
  useEffect(() => {
    const userId = user?.uid;
    if (!userId) {
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const fetchedTheme = await fetchUserTheme(userId);
        if (isCancelled) return;
        if (fetchedTheme !== themeRef.current) {
          lastChangeOriginRef.current = "remote";
          setThemeState(fetchedTheme);
        }
      } catch (error) {
        console.error("Failed to load user theme:", error);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [user?.uid]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState((prev) => {
      if (prev === mode) {
        return prev;
      }
      lastChangeOriginRef.current = "user";
      return mode;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      lastChangeOriginRef.current = "user";
      return next;
    });
  }, []);

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    darkMode: theme === "dark",
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
