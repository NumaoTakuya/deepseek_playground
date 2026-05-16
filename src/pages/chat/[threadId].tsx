// src/pages/chat/[threadId].tsx
import React, { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Box } from "@mui/material";
import ChatWindow from "../../components/chat/ChatWindow";
import { useTranslation } from "../../contexts/LanguageContext";

/**
 * 既存スレッドのチャットページ
 * - ここでは localStorage からapiKeyを取り出して ChatWindow に渡す
 */
export default function ThreadPage() {
  const router = useRouter();
  const { threadId } = router.query;
  const { t } = useTranslation();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!threadId || typeof threadId !== "string") {
    return <div>{t("chat.thread.invalid")}</div>;
  }

  return (
    <>
      <Head>
        <title>{t("chat.thread.meta.title")}</title>
        <meta name="description" content={t("chat.thread.meta.description")} />
        <meta property="og:title" content={t("chat.thread.meta.title")} />
        <meta
          property="og:description"
          content={t("chat.thread.meta.preview")}
        />
        <meta
          property="og:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
        <meta
          property="og:url"
          content="https://deepseek-playground.vercel.app/chat/[threadId]"
        />
        <meta property="og:type" content="article" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t("chat.thread.meta.title")} />
        <meta
          name="twitter:description"
          content={t("chat.thread.meta.twitter")}
        />
        <meta
          name="twitter:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
      </Head>
      <Box sx={{ height: "100dvh", minHeight: "100dvh", overflow: "hidden" }}>
        <ChatWindow threadId={threadId} />
      </Box>
    </>
  );
}
