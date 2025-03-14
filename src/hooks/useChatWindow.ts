// src/hooks/useChatWindow.ts

import { useState, useEffect, useRef } from "react";
import { db, analytics, logEvent } from "../services/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  listenMessages,
  createMessage,
  updateMessage,
} from "../services/message";
import { streamDeepseek } from "../services/deepseek";
import type { Message } from "../types/index";

type ChatRole = "system" | "user" | "assistant";

export function useChatWindow(threadId: string, apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [systemMsgId, setSystemMsgId] = useState<string | null>(null);
  const [model, setModel] = useState("deepseek-chat");
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [showSystemBox, setShowSystemBox] = useState(false);

  /**
   * “いま生成中のアシスタントメッセージID”
   *  - MessageListに渡して "Thinking..." を表示
   */
  const [assistantMsgId, setAssistantMsgId] = useState<string | null>(null);

  /**
   * “ローカルだけで保持する、途中生成中のアシスタントの本文”
   *  - contentに対するreasoning_contentに相当する
   *  - Firestoreには保存しない
   */
  const [assistantCoT, setAssistantCoT] = useState<string | null>(null);
  /**
   * “ローカルだけで保持する、途中生成中のアシスタントの本文”
   *  - Streamの途中経過をリアルタイムでUI表示するために使う
   *  - Firestoreに書くのは最後1回
   */
  const [assistantDraft, setAssistantDraft] = useState("");

  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

  // -- メッセージ購読 --
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      const sorted = [...fetched].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt - b.createdAt;
      });
      setMessages(sorted);

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

  // -- thread購読 (model/title) --
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "threads", threadId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as { model?: string };
        setModel(data.model ?? "deepseek-chat");
      }
    });
    return () => unsub();
  }, [threadId]);

  // -- systemPrompt更新 --
  async function handleSystemPromptUpdate() {
    if (!systemMsgId) {
      await createMessage(threadId, "system", systemPrompt);
    } else {
      await updateMessage(threadId, systemMsgId, systemPrompt);
    }
  }

  // -- model変更 --
  async function handleModelChange(newModel: string) {
    setModel(newModel);
    await updateDoc(doc(db, "threads", threadId), { model: newModel });
  }

  // -- 送信 --
  async function handleSend() {
    // 送信中なら→停止
    if (assistantThinking) {
      if (chatStreamRef.current) {
        chatStreamRef.current.abort();
      }
      return;
    }
    if (!input.trim()) return;

    const userText = input.trim();
    const startTime = Date.now();
    // メッセージ送信開始イベント
    if (analytics) {
      logEvent(analytics, "message_send_start", {
        threadId,
        model: model ?? "unknown",
        messageLength: userText.length,
      });
    }
    setInput("");
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT("");
    setAssistantDraft("");

    try {
      // 1) systemPromptをFirestoreへ
      await handleSystemPromptUpdate();

      // 2) userメッセージ
      await createMessage(threadId, "user", userText);

      // 3) 空のassistantメッセージ (Firestore) → ID取得
      const newAssistantMsgId = await createMessage(threadId, "assistant", "");
      setAssistantMsgId(newAssistantMsgId); // thinking対象

      // 4) 過去の会話づくり
      const conversation = [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        { role: "user", content: userText },
      ] as { role: ChatRole; content: string }[];

      // 5) ストリーミング
      const chatStream = await streamDeepseek(apiKey, conversation, model);
      chatStreamRef.current = chatStream;

      let partialReasoningContent = "";
      let partialContent = "";
      let first = true;

      for await (const chunk of chatStream) {
        interface Delta {
          reasoning_content?: string;
          content?: string;
        }

        const delta = chunk.choices[0]?.delta as Delta;
        const delta_reasoning_content = delta.reasoning_content ?? "";
        const delta_content = delta.content ?? "";
        if (delta_reasoning_content) {
          partialReasoningContent += delta_reasoning_content;
          if (first) {
            setWaitingForFirstChunk(false);
            first = false;
          }
          setAssistantCoT(partialReasoningContent);
        }
        if (delta_content) {
          partialContent += delta_content;
          if (first) {
            setWaitingForFirstChunk(false);
            first = false;
          }
          setAssistantDraft(partialContent);
        }
      }

      // 6) ストリーム完了: Firestoreにまとめて書き込み
      await updateMessage(threadId, newAssistantMsgId, partialContent);

      // メッセージ送信成功イベント
      if (analytics) {
        logEvent(analytics, "message_send_success", {
          threadId,
          model,
          messageLength: userText.length,
          responseLength: partialContent.length,
          duration: Date.now() - startTime,
        });
      }
    } catch (err) {
      console.error("handleSend error (stream)", err);
      // メッセージ送信失敗イベント
      if (analytics) {
        logEvent(analytics, "message_send_failure", {
          threadId,
          model,
          messageLength: userText.length,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
    }
  }

  return {
    messages,
    input,
    setInput,
    model,
    setModel,
    systemPrompt,
    setSystemPrompt,
    showSystemBox,
    setShowSystemBox,
    handleModelChange,
    handleSend,
    waitingForFirstChunk,
    assistantThinking,
    assistantMsgId,
    assistantCoT,
    assistantDraft,
  };
}
