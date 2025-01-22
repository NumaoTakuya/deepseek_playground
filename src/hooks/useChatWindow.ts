// hooks/useChatWindow.ts
import { useState, useEffect, useRef } from "react";
import { db } from "../services/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  listenMessages,
  createMessage,
  updateMessage,
} from "../services/message";
import { callDeepseek } from "../services/deepseek";
import type { Message } from "../types/index";

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

  // 「タイトル生成が既に走ったかどうか」のフラグ
  const titleGeneratingRef = useRef(false);

  // Firestoreメッセージ購読
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched: Message[]) => {
      // 時系列順にソート
      const sorted = [...fetched].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt - b.createdAt;
      });
      setMessages(sorted);

      // systemメッセージがあれば取り出す
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

  // スレッドドキュメント購読 (modelとtitle取得)
  useEffect(() => {
    const threadRef = doc(db, "threads", threadId);
    const unsub = onSnapshot(threadRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as {
          model?: string;
          title?: string;
        };
        setModel(data.model ?? "deepseek-chat");
        setTitle(data.title ?? "New Thread");
      }
    });
    return () => unsub();
  }, [threadId]);

  // タイトルが"New Thread"の場合、バックグラウンドでcallDeepseek
  // → ユーザーの最初の発言を使ってタイトル生成＆Firestore更新
  useEffect(() => {
    if (title !== "New Thread" || titleGeneratingRef.current) return;

    // 最初のユーザー発言を取り出す
    const userMsg = messages.find((m) => m.role === "user");
    if (!userMsg) return;
    titleGeneratingRef.current = true;

    (async () => {
      try {
        const promptForTitle = [
          {
            role: "system" as const,
            content:
              "You generate a short conversation title based on the user's first message within 10-15 letters. Output ONLY the title text without quotes or disclaimers.",
          },
          {
            role: "user" as const,
            content: `User's first message: ${userMsg.content}`,
          },
        ];
        const rawTitle = await callDeepseek(apiKey, promptForTitle);
        const finalTitle = (rawTitle || "").trim();
        const newTitle =
          finalTitle.length > 0 ? finalTitle : userMsg.content.slice(0, 10);

        // Firestore更新
        await updateDoc(doc(db, "threads", threadId), {
          title: newTitle,
        });
      } catch (err) {
        console.error("Title generation error:", err);
      }
    })();
  }, [title, messages, threadId, apiKey]);

  // 「最後が user」のとき自動でアシスタント応答
  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "user" && !assistantThinking) {
      setAssistantThinking(true);

      (async () => {
        try {
          // Deepseek呼び出し
          const assistantContent = await callDeepseek(
            apiKey,
            messages.map((m) => ({ role: m.role, content: m.content })),
            model
          );
          // Firestoreにassistantメッセージを保存
          await createMessage(threadId, "assistant", assistantContent);
        } catch (err) {
          console.error("Failed to get AI response:", err);
        } finally {
          setAssistantThinking(false);
        }
      })();
    }
  }, [messages, assistantThinking, apiKey, model, threadId]);

  // system prompt 更新
  const handleSystemPromptUpdate = async () => {
    if (!systemMsgId) return;
    try {
      await updateMessage(threadId, systemMsgId, systemPrompt);
    } catch (err) {
      console.error("Failed to update system prompt:", err);
    }
  };

  // モデル変更
  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    try {
      const threadRef = doc(db, "threads", threadId);
      await updateDoc(threadRef, { model: newModel });
    } catch (err) {
      console.error("Failed to update model in thread doc:", err);
    }
  };

  // ユーザーメッセージ送信
  const handleSend = async () => {
    if (!input.trim() || assistantThinking) return;
    const userText = input.trim();
    setInput("");
    setAssistantThinking(true);

    try {
      await createMessage(threadId, "user", userText);
      // 自動返信は上の useEffect で捕捉
    } catch (err) {
      console.error("Failed to send user message:", err);
      setAssistantThinking(false);
    }
  };

  return {
    messages,
    systemPrompt,
    setSystemPrompt,
    systemMsgId,
    handleSystemPromptUpdate,

    model,
    handleModelChange,
    title, // ← 必要に応じてチャット画面のヘッダー等で使える
    input,
    setInput,
    assistantThinking,
    showSystemBox,
    setShowSystemBox,
    handleSend,
  };
}
