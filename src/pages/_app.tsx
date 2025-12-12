// src/pages/_app.tsx
import "../styles/global.css";
import "katex/dist/katex.min.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { AuthProvider } from "../contexts/AuthContext";
import Layout from "../components/layout/Layout";
import { ApiKeyProvider } from "../contexts/ApiKeyContext";
import { initializeUserCount, logEvent, analytics } from "../services/firebase";
import { ThemeProvider } from "../contexts/ThemeContext";
import { LanguageProvider } from "../contexts/LanguageContext";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    initializeUserCount().catch((error) => {
      console.error("Failed to initialize user count:", error);
    });
  }, []);

  // Track page views
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (analytics) {
        logEvent(analytics, "page_view", {
          page_path: url,
        });
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);
  // 指定したパスの場合はそのページを表示
  const isLpPage = router.pathname === "/";
  const isLoginPage = router.pathname === "/login";
  const isDonatePage = router.pathname === "/donate";

  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeProvider>
          <ApiKeyProvider>
            {isLpPage || isLoginPage || isDonatePage ? (
              <Component {...pageProps} />
            ) : (
              <Layout>
                <Component {...pageProps} />
              </Layout>
            )}
          </ApiKeyProvider>
        </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default MyApp;
