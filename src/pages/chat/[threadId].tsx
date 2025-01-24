// pages/chat/[threadId].tsx
import React from "react";
import { useRouter } from "next/router";
import ChatWindow from "../../components/chat/ChatWindow";
import Head from "next/head";

/**
 * 既存スレッドのチャットページ
 * - ここでは localStorage からapiKeyを取り出して ChatWindow に渡す
 */
export default function ThreadPage() {
  const router = useRouter();
  const { threadId } = router.query;

  if (!threadId || typeof threadId !== "string") {
    return <div>Invalid thread ID</div>;
  }

  // ページ全体のスクロールを禁止（こうしないとlatex表記が存在するとき、謎の莫大なスクロールスペースが出る）
  if (typeof document !== "undefined") document.body.style.overflow = "hidden";

  return (
    <>
      <Head>
        <title>Chat Thread - Deepseek Playground</title>
        <meta
          name="description"
          content="Continue your AI chat conversation powered by Deepseek. Save messages in Firestore, adjust system prompts."
        />
        <meta property="og:title" content="Chat Thread - Deepseek Playground" />
        <meta
          property="og:description"
          content="Keep your conversation with a custom system prompt. Non-official Deepseek integration."
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
        <meta
          name="twitter:title"
          content="Chat Thread - Deepseek Playground"
        />
        <meta
          name="twitter:description"
          content="Edit your system prompt on the fly, send messages to Deepseek, and store them in Firestore."
        />
        <meta
          name="twitter:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
      </Head>
      <ChatWindow threadId={threadId} />
    </>
  );
}
