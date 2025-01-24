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
import { FirebaseError } from "firebase/app"; // 追加（エラーハンドリング用）
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
  console.trace("createMessage", threadId, role, content);
  try {
    const messagesRef = collection(db, "threads", threadId, "messages");
    const docRef = await addDoc(messagesRef, {
      threadId,
      role,
      content,
      createdAt: serverTimestamp(),
    });
    return docRef.id; // Return the new document ID
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (error.code === "resource-exhausted") {
        // クォータ超過
        console.error(
          "[createMessage] Firestore quota exceeded. Please try again later."
        );
        // 必要ならUIに通知したり、リトライ処理を実装したりできる
      } else {
        // その他のFirestoreエラー
        console.error(
          "[createMessage] Firestore error:",
          error.code,
          error.message
        );
      }
    } else {
      // Firebase以外の不明なエラー
      console.error("[createMessage] Unknown error:", error);
    }
    // throwして上位にエラーを伝える or ここで null を返すなどお好みで
    throw error;
  }
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

    // onSnapshotの第2引数でエラーを受け取れる
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: Message[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Message, "id">),
        }));
        setMessages(data);
        setLoading(false);
      },
      (error) => {
        // ここで snapshot のエラーを受け取れる
        if (error instanceof FirebaseError) {
          if (error.code === "resource-exhausted") {
            console.error(
              "[useMessages] Firestore quota exceeded (onSnapshot)."
            );
          } else {
            console.error(
              "[useMessages] Firestore onSnapshot error:",
              error.code,
              error.message
            );
          }
        } else {
          console.error("[useMessages] Unknown onSnapshot error:", error);
        }
        setLoading(false);
      }
    );

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

  return onSnapshot(
    q,
    (snapshot) => {
      const data: Message[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Message, "id">),
      }));
      callback(data);
    },
    (error) => {
      // onSnapshotのエラーコールバック
      if (error instanceof FirebaseError) {
        if (error.code === "resource-exhausted") {
          console.error(
            "[listenMessages] Firestore quota exceeded (onSnapshot)."
          );
        } else {
          console.error(
            "[listenMessages] Firestore onSnapshot error:",
            error.code,
            error.message
          );
        }
      } else {
        console.error("[listenMessages] Unknown onSnapshot error:", error);
      }
    }
  );
}

/**
 * メッセージ更新（内容を変更する）
 */
export async function updateMessage(
  threadId: string,
  messageId: string,
  content: string
) {
  try {
    const messageRef = doc(db, "threads", threadId, "messages", messageId);
    await updateDoc(messageRef, { content });
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (error.code === "resource-exhausted") {
        console.error(
          "[updateMessage] Firestore quota exceeded. Please try again later."
        );
      } else {
        console.error(
          "[updateMessage] Firestore error:",
          error.code,
          error.message
        );
      }
    } else {
      console.error("[updateMessage] Unknown error:", error);
    }
    throw error;
  }
}
