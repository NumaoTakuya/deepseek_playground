// src/services/userPreferences.ts
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Language } from "../i18n/translations";

export type ThemeMode = "light" | "dark";

const DEFAULT_THEME: ThemeMode = "dark";
export const DEFAULT_LANGUAGE: Language = "en";
const SUPPORTED_LANGUAGES: Language[] = [
  "en",
  "zh",
  "hi",
  "ja",
  "ru",
  "de",
];

interface UserPreferencesDocument {
  theme?: ThemeMode;
  language?: Language;
}

export async function fetchUserTheme(userId: string): Promise<ThemeMode> {
  const userRef = doc(db, "users", userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return DEFAULT_THEME;
  }

  const data = snapshot.data() as UserPreferencesDocument | undefined;
  if (!data) {
    return DEFAULT_THEME;
  }

  return data.theme === "light" || data.theme === "dark"
    ? data.theme
    : DEFAULT_THEME;
}

export async function persistUserTheme(
  userId: string,
  theme: ThemeMode
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await setDoc(userRef, { theme }, { merge: true });
}

export async function fetchUserLanguage(userId: string): Promise<Language> {
  const userRef = doc(db, "users", userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return DEFAULT_LANGUAGE;
  }

  const data = snapshot.data() as UserPreferencesDocument | undefined;
  const lang = data?.language;

  if (lang && SUPPORTED_LANGUAGES.includes(lang as Language)) {
    return lang as Language;
  }

  return DEFAULT_LANGUAGE;
}

export async function persistUserLanguage(
  userId: string,
  language: Language
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await setDoc(userRef, { language }, { merge: true });
}

export { DEFAULT_THEME };
