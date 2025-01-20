import React from "react";
import { useRouter } from "next/router";
import ChatWindow from "../../components/chat/ChatWindow";

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

  return <ChatWindow threadId={threadId} />;
}
