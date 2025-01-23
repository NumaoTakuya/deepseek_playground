// hooks/useChatWindow.ts

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

  // 途中停止用に: 現在のストリームを格納する
  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

  // Firestore からメッセージ取得 (画面表示用)
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      // 時間順にソート
      const sorted = [...fetched].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt - b.createdAt;
      });
      setMessages(sorted);

      // system メッセージを拾って、ローカルstateに反映
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

  // Firestore側の systemメッセージを更新する関数
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
   * 送信ボタンが押されたとき
   * - 送信中の場合は stream.abort() で停止
   * - 未送信の場合は system prompt を先にFirestoreに反映 → ストリーム実行
   */
  const handleSend = async () => {
    // 送信中なら → 停止フロー
    if (assistantThinking) {
      if (chatStreamRef.current) {
        chatStreamRef.current.abort(); // stream停止
      }
      return;
    }

    // 未送信なら → 新規送信処理
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);

    try {
      // 1) 送信前にSystemPromptをFirestoreへ反映
      await handleSystemPromptUpdate();

      // 2) ユーザーメッセージ作成
      await createMessage(threadId, "user", userText);

      // 3) 空のアシスタントメッセージを先に作成
      const assistantMsgId = await createMessage(threadId, "assistant", "");

      // 4) streamDeepseek に投げるメッセージを作成
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

      // 5) ストリーミング開始
      const chatStream = await streamDeepseek(apiKey, conversation, model);
      chatStreamRef.current = chatStream;

      let partialContent = "";
      let firstChunkReceived = false;

      // 6) for-await で逐次トークン受信
      for await (const chunk of chatStream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          partialContent += delta;

          // 最初のチャンクが来たら "Thinking..." を解除
          if (!firstChunkReceived) {
            setWaitingForFirstChunk(false);
            firstChunkReceived = true;
          }

          // 毎チャンクで Firestore の assistantメッセージを更新
          await updateMessage(threadId, assistantMsgId, partialContent);
        }
      }
    } catch (err) {
      console.error("handleSend error (stream):", err);
    } finally {
      // 完了 or 停止後にフラグ解除
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
