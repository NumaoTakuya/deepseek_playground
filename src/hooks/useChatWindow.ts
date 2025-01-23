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
import type { ChatCompletionMessageParam } from "../services/deepseek";

/** ローカル表示用のメッセージ型。Firestoreの `Message` と似ているが、
 *  途中生成中のassistantメッセージを扱うために optional なフィールドなどを加えてもOK。
 */
type LocalMessage = Message & {
  /** 途中生成中かどうか */
  _isDraft?: boolean;
};

export function useChatWindow(threadId: string, apiKey: string) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
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

  // ストリームのキャンセル用
  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

  // --- 1. Firestoreからメッセージ購読 ---
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      // 時間順にソート
      const sorted = [...fetched].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt - b.createdAt;
      });

      // local state に反映
      setMessages((prev) => {
        // もし今、途中生成中(_isDraft=true)のassistantメッセージがあった場合は、
        // fetched に含まれる “assistant (空文字 or 途中)” と競合するかもしれない。
        // ただし実際には、abort時の整理などで工夫が必要。
        // ここでは単純に fetched を優先するとします:
        return sorted;
      });

      // system メッセージがあれば同期
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

  // --- 2. threads ドキュメント購読 ---
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

  // --- system メッセージ更新 ---
  async function handleSystemPromptUpdate() {
    if (!systemMsgId) {
      await createMessage(threadId, "system", systemPrompt);
    } else {
      await updateMessage(threadId, systemMsgId, systemPrompt);
    }
  }

  // --- model更新 ---
  async function handleModelChange(newModel: string) {
    setModel(newModel);
    await updateDoc(doc(db, "threads", threadId), { model: newModel });
  }

  /**
   * メイン: 送信ボタンでメッセージ生成
   *
   * - 途中でアシスタントメッセージを"draft"として localState に表示
   * - ストリーム完了 (またはabort) 後に Firestoreへ1回だけ update
   */
  async function handleSend() {
    // 送信中 → 停止フロー
    if (assistantThinking) {
      if (chatStreamRef.current) {
        chatStreamRef.current.abort();
      }
      return;
    }

    // 未入力は無視
    if (!input.trim()) return;

    const userText = input.trim();
    setInput("");

    setAssistantThinking(true);
    setWaitingForFirstChunk(true);

    try {
      // 1) systemPrompt → Firestore
      await handleSystemPromptUpdate();

      // 2) userメッセージを作成 (Firestore)
      await createMessage(threadId, "user", userText);

      // 3) 先に空のassistantをFirestoreに作成 (後で1回だけ更新)
      const assistantMsgId = await createMessage(threadId, "assistant", "");

      // 4) localState 上には "_isDraft" メッセージを1件追加
      setMessages((prev) => {
        return [
          ...prev,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            threadId,
            createdAt: Date.now(),
            _isDraft: true, // これで「途中のメッセージ」とわかる
          },
        ];
      });

      // 5) 過去の会話作成
      const conversation: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content } as const)),
        { role: "user", content: userText } as const,
      ];

      // 6) ストリーミング開始
      const chatStream = await streamDeepseek(apiKey, conversation, model);
      chatStreamRef.current = chatStream;

      let partialContent = "";
      let firstChunkReceived = false;

      // 7) for-awaitでchunk受信
      for await (const chunk of chatStream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          partialContent += delta;

          if (!firstChunkReceived) {
            firstChunkReceived = true;
            setWaitingForFirstChunk(false);
          }

          // --- ★ ここで“ローカルstate”の最後のassistantメッセージを更新 ---
          setMessages((prev) => {
            // 最後の or assistantMsgId のメッセージを差し替え
            const newMsgs = [...prev];
            const idx = newMsgs.findIndex((m) => m.id === assistantMsgId);
            if (idx >= 0) {
              newMsgs[idx] = {
                ...newMsgs[idx],
                content: partialContent,
              };
            }
            return newMsgs;
          });

          // ※ ここでは Firestore 更新はしない
          //  → chunkごとにFireStore書き込みするとクォータ超過
        }
      }

      // --- ストリーミング完了: まとめて1回 Firestore 書き込み ---
      await updateMessage(threadId, assistantMsgId, partialContent);

      // `_isDraft` を消す or 何らかのフラグ更新
      setMessages((prev) => {
        const newMsgs = [...prev];
        const idx = newMsgs.findIndex((m) => m.id === assistantMsgId);
        if (idx >= 0) {
          newMsgs[idx] = {
            ...newMsgs[idx],
            _isDraft: false,
          };
        }
        return newMsgs;
      });
    } catch (err) {
      console.error("handleSend error (stream):", err);

      // 失敗した場合、とりあえず `_isDraft` メッセージを削除するなどの処理
      setMessages((prev) => prev.filter((m) => m._isDraft !== true));
    } finally {
      setAssistantThinking(false);
      chatStreamRef.current = null;
    }
  }

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
