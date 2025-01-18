import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import ChatWindow from "../../components/chat/ChatWindow";

/**
 * 既存スレッドのチャットページ
 * - ここでは localStorage からapiKeyを取り出して ChatWindow に渡す
 */
export default function ThreadPage() {
  const router = useRouter();
  const { threadId } = router.query;

  // localStorage からキーを取得
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const storedKey = localStorage.getItem("deepseekApiKey") || "";
    setApiKey(storedKey);
  }, []);

  if (!threadId || typeof threadId !== "string") {
    return <div>Invalid thread ID</div>;
  }

  return <ChatWindow threadId={threadId} apiKey={apiKey} />;
}
