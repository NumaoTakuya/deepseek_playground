import { useState, useEffect } from "react";
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
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [showSystemBox, setShowSystemBox] = useState(false);

  // メッセージ購読
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched: Message[]) => {
      const withThread = fetched.map((msg: Message) => ({
        ...msg,
        threadId,
      }));
      setMessages(withThread);

      const sys = withThread.find((m: Message) => m.role === "system");
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

  // モデル購読
  useEffect(() => {
    const threadRef = doc(db, "threads", threadId);
    const unsub = onSnapshot(threadRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as { model?: string };
        setModel(data.model ?? "deepseek-chat");
      }
    });
    return () => unsub();
  }, [threadId]);

  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    try {
      const threadRef = doc(db, "threads", threadId);
      await updateDoc(threadRef, { model: newModel });
    } catch (err) {
      console.error("Failed to update model in thread doc:", err);
      throw new Error("Failed to update model");
    }
  };

  const handleSystemPromptUpdate = async () => {
    if (!systemMsgId) return;
    try {
      await updateMessage(threadId, systemMsgId, systemPrompt);
    } catch (err) {
      console.error("Failed to update system prompt:", err);
      throw new Error("Failed to update system prompt");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || assistantThinking) return;

    setAssistantThinking(true);
    await createMessage(threadId, "user", input);
    setInput("");

    try {
      const assistantMessage = await callDeepseek(
        apiKey,
        [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: input },
        ],
        model
      );

      await createMessage(threadId, "assistant", assistantMessage);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setAssistantThinking(false);
    }
  };

  return {
    messages,
    systemPrompt,
    setSystemPrompt,
    model,
    handleModelChange,
    handleSystemPromptUpdate,
    systemMsgId,
    input,
    setInput,
    assistantThinking,
    showSystemBox,
    setShowSystemBox,
    handleSend,
  };
}
