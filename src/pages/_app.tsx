// src/pages/_app.tsx
import "../styles/global.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { AuthProvider } from "../contexts/AuthContext";
import Layout from "../components/layout/Layout";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  // ルートパス ("/") はログイン画面とし、他は Layout を適用
  const isLoginPage = router.pathname === "/";

  return (
    <AuthProvider>
      {isLoginPage ? (
        <Component {...pageProps} />
      ) : (
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}
    </AuthProvider>
  );
}

export default MyApp;
