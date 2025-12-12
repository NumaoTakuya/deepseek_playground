import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { translations, type Language, type TranslationKey } from "../i18n/translations";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_LANGUAGE,
  fetchUserLanguage,
  persistUserLanguage,
} from "../services/userPreferences";

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const STORAGE_KEY = "deepseek-playground-language";

function resolveStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored in translations) {
      return stored as Language;
    }
  } catch (error) {
    console.error("Failed to read language from localStorage:", error);
  }

  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const languageRef = useRef(language);
  const lastChangeOriginRef = useRef<"user" | "local" | "remote" | null>(null);
  const hasHydratedFromLocalRef = useRef(false);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedLanguage = resolveStoredLanguage();
    hasHydratedFromLocalRef.current = true;
    lastChangeOriginRef.current = "local";
    setLanguageState(storedLanguage);
  }, []);

  useEffect(() => {
    if (!hasHydratedFromLocalRef.current) {
      return;
    }

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, language);
      } catch (error) {
        console.error("Failed to write language to localStorage:", error);
      }
    }

    if (user?.uid && lastChangeOriginRef.current === "user") {
      persistUserLanguage(user.uid, language).catch((error) => {
        console.error("Failed to persist user language:", error);
      });
    }

    lastChangeOriginRef.current = null;
  }, [language, user?.uid]);

  useEffect(() => {
    const userId = user?.uid;
    if (!userId) {
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const remoteLanguage = await fetchUserLanguage(userId);
        if (isCancelled) return;
        if (remoteLanguage !== languageRef.current) {
          lastChangeOriginRef.current = "remote";
          setLanguageState(remoteLanguage);
        }
      } catch (error) {
        console.error("Failed to load user language:", error);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [user?.uid]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState((prev) => {
      if (prev === next) {
        return prev;
      }
      lastChangeOriginRef.current = "user";
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
    }),
    [language, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

type TemplateVariables = Record<string, string | number>;

export function useTranslation() {
  const { language, setLanguage } = useLanguage();

  const t = useCallback(
    (key: TranslationKey, variables?: TemplateVariables) => {
      const dictionary = translations[language] ?? translations.en;
      const fallback = translations.en;
      const template = dictionary[key] ?? fallback[key] ?? key;
      if (!variables) return template;
      return template.replace(/{{(\w+)}}/g, (_, token: string) => {
        const value = variables[token];
        return value === undefined || value === null ? "" : String(value);
      });
    },
    [language]
  );

  return { t, language, setLanguage };
}
