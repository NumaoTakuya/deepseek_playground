// src/pages/_app.tsx
import "../styles/global.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { AuthProvider } from "../contexts/AuthContext";
import Layout from "../components/layout/Layout";
import { ApiKeyProvider } from "../contexts/ApiKeyContext";
import { initializeUserCount } from "../services/firebase";

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initializeUserCount().catch((error) => {
      console.error("Failed to initialize user count:", error);
    });
  }, []);
  const router = useRouter();
  // 指定したパスの場合はそのページを表示
  const isLpPage = router.pathname === "/";
  const isLoginPage = router.pathname === "/login";
  const isDonatePage = router.pathname === "/donate";

  return (
    <AuthProvider>
      <ApiKeyProvider>
        {isLpPage || isLoginPage || isDonatePage ? (
          <Component {...pageProps} />
        ) : (
          <Layout>
            <Component {...pageProps} />
          </Layout>
        )}
      </ApiKeyProvider>
    </AuthProvider>
  );
}

export default MyApp;
