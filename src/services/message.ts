// src/services/message.ts

import { db } from "./firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { useState, useEffect } from "react";

/** Firestore上で扱うメッセージの型定義 */
export interface Message {
  id: string;
  threadId?: string; // 必要なら格納
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: any;
}

/**
 * 指定スレッドに新しいメッセージを追加
 * - サブコレクション: /threads/{threadId}/messages
 */
export async function createMessage(
  threadId: string,
  role: Message["role"],
  content: string
) {
  const messagesRef = collection(db, "threads", threadId, "messages");

  // Firestoreセキュリティルール上、親スレッドが自分のuserIdであればOK
  await addDoc(messagesRef, {
    threadId, // 必要に応じて保存
    role,
    content,
    createdAt: serverTimestamp(),
  });
}

/**
 * 指定スレッドのメッセージをリアルタイム取得するカスタムフック
 * - 例: コンポーネント内で `const { messages, loading } = useMessages(threadId)`
 * - orderBy(createdAt, asc) で古い順に並べる
 */
export function useMessages(threadId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) return;

    const messagesRef = collection(db, "threads", threadId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Message[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Message, "id">),
      }));
      setMessages(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [threadId]);

  return { messages, loading };
}

/**
 * 指定スレッドのメッセージをリアルタイム購読する低レベル関数
 * - コールバック方式で使いたい場合
 */
export function listenMessages(
  threadId: string,
  callback: (messages: Message[]) => void
) {
  const messagesRef = collection(db, "threads", threadId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  return onSnapshot(q, (snapshot) => {
    const data: Message[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Message, "id">),
    }));
    callback(data);
  });
}
