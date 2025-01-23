import { useState, useEffect, useRef } from "react";
import { db } from "../services/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  listenMessages,
  createMessage,
  updateMessage,
} from "../services/message";
import { streamDeepseek } from "../services/deepseek";
import type { Message } from "../types/index";

// チャットで利用するロールの型
type ChatRole = "system" | "user" | "assistant";

// ChatCompletion に投げる用のメッセージ型
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
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [showSystemBox, setShowSystemBox] = useState(false);

  // ↓ 追加: ストリームを格納しておく参照
  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

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

  // systemPromptをFirestoreに更新
  const handleSystemPromptUpdate = async () => {
    if (!systemMsgId) {
      // systemメッセージがまだ無ければ作成
      await createMessage(threadId, "system", systemPrompt);
    } else {
      // 既存 systemメッセージを更新
      await updateMessage(threadId, systemMsgId, systemPrompt);
    }
  };

  // model変更をFirestoreに反映
  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    await updateDoc(doc(db, "threads", threadId), { model: newModel });
  };

  /**
   * メインの送信ボタン
   * - 送信中の場合はストリームをabort()
   * - 未送信の場合は新しくストリーミング開始
   */
  const handleSend = async () => {
    // 送信中なら停止処理
    if (assistantThinking) {
      if (chatStreamRef.current) {
        // stream.abort() 実行
        chatStreamRef.current.abort();
      }
      return;
    }

    // ここから未送信の場合
    if (!input.trim()) return;
    const userText = input.trim();
    setInput(""); // 入力欄をクリア
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);

    try {
      // 1) ユーザーメッセージを作成
      await createMessage(threadId, "user", userText);

      // 2) 空のアシスタントメッセージを先に作成
      const assistantMsgId = await createMessage(threadId, "assistant", "");

      // 3) 投げるメッセージ構築
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

      // 4) ストリーミング開始
      const chatStream = await streamDeepseek(apiKey, conversation, model);
      chatStreamRef.current = chatStream;

      let partialContent = "";
      let firstChunkReceived = false;

      // 5) for-await でトークンを受け取る
      for await (const chunk of chatStream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          partialContent += delta;

          if (!firstChunkReceived) {
            setWaitingForFirstChunk(false);
            firstChunkReceived = true;
          }

          // Firestore の assistantメッセージ更新
          await updateMessage(threadId, assistantMsgId, partialContent);
        }
      }
    } catch (err) {
      console.error("handleSend error (stream):", err);
    } finally {
      // 完了または停止後、フラグ戻し
      setAssistantThinking(false);
      chatStreamRef.current = null;
    }
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
    waitingForFirstChunk,
    showSystemBox,
    setShowSystemBox,
    handleSend,
    handleSystemPromptUpdate,
    handleModelChange,
  };
}
