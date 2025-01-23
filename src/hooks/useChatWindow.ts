// hooks/useChatWindow.ts

import { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  listenMessages,
  createMessage,
  updateMessage,
} from "../services/message";
import { streamDeepseek } from "../services/deepseek"; // ストリーミング版を使う想定
import type { Message } from "../types/index";

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
};

export function useChatWindow(threadId: string, apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [systemMsgId, setSystemMsgId] = useState<string | null>(null);
  const [model, setModel] = useState("deepseek-chat");
  const [title, setTitle] = useState("New Thread");
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [showSystemBox, setShowSystemBox] = useState(false);

  // Firestore からメッセージ取得 (画面表示用)
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      const sorted = [...fetched].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt - b.createdAt;
      });
      setMessages(sorted);

      // systemメッセージの反映
      const sys = sorted.find((m) => m.role === "system");
      if (sys) {
        setSystemMsgId(sys.id);
        setSystemPrompt(sys.content);
      } else {
        setSystemMsgId(null);
        setSystemPrompt("You are a helpful assistant.");
      }
    });
    return () => unsubscribe();
  }, [threadId]);

  // スレッド (model, title) 購読
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "threads", threadId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as { model?: string; title?: string };
        setModel(data.model ?? "deepseek-chat");
        setTitle(data.title ?? "New Thread");
      }
    });
    return () => unsub();
  }, [threadId]);

  // --- ここまでが「UI表示用に Firestoreを購読」してる部分 ---

  // ユーザー送信 → その場でストリーミング呼び出し
  const handleSend = async () => {
    if (!input.trim() || assistantThinking) return;
    const userText = input.trim();
    setInput(""); // 入力欄をクリア
    setAssistantThinking(true); // thinking開始

    try {
      // 1) ユーザーメッセージを作成
      await createMessage(threadId, "user", userText);

      // 2) 空のアシスタントメッセージを先に作成 (content: "")
      const assistantMsgId = await createMessage(threadId, "assistant", "");

      // 3) ストリーミング (ここでローカルの conversation履歴を準備)
      const conversation: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role as ChatRole,
            content: m.content,
          })),
        { role: "user", content: userText },
      ];

      let partialContent = "";
      for await (const chunk of streamDeepseek(apiKey, conversation, model)) {
        partialContent += chunk;
        // 4) 毎チャンクごとに同じassistantメッセージをupdate
        await updateMessage(threadId, assistantMsgId, partialContent);
      }
      // 5) 完了。partialContentに全文が入る
    } catch (err) {
      console.error("handleSend error (stream):", err);
    } finally {
      setAssistantThinking(false);
    }
  };

  // 他: system prompt更新, model変更 なども同様
  const handleSystemPromptUpdate = async () => {
    /*...*/
  };
  const handleModelChange = async (newModel: string) => {
    /*...*/
  };

  return {
    messages,
    systemPrompt,
    setSystemPrompt,
    model,
    setModel,
    title,
    input,
    setInput,
    assistantThinking,
    showSystemBox,
    setShowSystemBox,
    handleSend,
    handleSystemPromptUpdate,
    handleModelChange,
  };
}
