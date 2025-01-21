// src/services/message.ts

import { db } from "./firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useState, useEffect } from "react";

import { Message } from "../types/index";

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
  const docRef = await addDoc(messagesRef, {
    threadId,
    role,
    content,
    createdAt: serverTimestamp(),
  });
  return docRef.id; // Return the new document ID
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

export function updateMessage(
  threadId: string,
  messageId: string,
  content: string
) {
  const messageRef = doc(db, "threads", threadId, "messages", messageId);
  return updateDoc(messageRef, { content });
}
