// src/services/userPreferences.ts
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type ThemeMode = "light" | "dark";

const DEFAULT_THEME: ThemeMode = "dark";

interface UserPreferencesDocument {
  theme?: ThemeMode;
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

export { DEFAULT_THEME };
