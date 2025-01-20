// src/contexts/ApiKeyContext.tsx
import React, { createContext, useState, useEffect, useContext } from "react";

interface ApiKeyContextProps {
  apiKey: string;
  setApiKey: (key: string) => void;
}

const ApiKeyContext = createContext<ApiKeyContextProps>({
  apiKey: "",
  setApiKey: () => {},
});

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState("");

  useEffect(() => {
    // 初回マウント時に localStorage から読み込み
    const storedKey =
      typeof window !== "undefined"
        ? localStorage.getItem("deepseekApiKey") || ""
        : "";
    setApiKeyState(storedKey);
  }, []);

  // Contextのsetter
  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (typeof window !== "undefined") {
      localStorage.setItem("deepseekApiKey", key);
    }
  };

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  return useContext(ApiKeyContext);
}
