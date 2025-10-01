// src/services/message.ts

import { db, analytics } from "./firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  type WithFieldValue,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app"; // 追加（エラーハンドリング用）
import { logEvent } from "firebase/analytics";
import { useState, useEffect } from "react";

import type { Message } from "../types/index";

type MessageDocument = Omit<Message, "id">;

/**
 * 指定スレッドに新しいメッセージを追加
 * - サブコレクション: /threads/{threadId}/messages
 */
export async function createMessage(
  threadId: string,
  role: Message["role"],
  content: string,
  thinkingContent?: string | null
) {
  try {
    const messagesRef = collection(db, "threads", threadId, "messages");
    const payload: WithFieldValue<MessageDocument> = {
      threadId,
      role,
      content,
      createdAt: serverTimestamp(),
    };
    if (thinkingContent !== undefined) {
      payload.thinking_content = thinkingContent;
    }

    const docRef = await addDoc(messagesRef, payload);

    // Log message sent event
    if (analytics) {
      logEvent(analytics, "message_sent", {
        thread_id: threadId,
        role: role,
        content_length: content.length,
      });
    }

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
        const data: Message[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as MessageDocument),
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
      const data: Message[] = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as MessageDocument),
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
  content?: string,
  thinkingContent?: string | null
) {
  try {
    const messageRef = doc(db, "threads", threadId, "messages", messageId);
    const updatePayload: {
      content?: string;
      thinking_content?: string | null;
    } = {};
    if (content !== undefined) {
      updatePayload.content = content;
    }
    if (thinkingContent !== undefined) {
      updatePayload.thinking_content = thinkingContent;
    }
    if (Object.keys(updatePayload).length === 0) {
      return;
    }

    await updateDoc(messageRef, updatePayload);
    if (analytics && content !== undefined) {
      logEvent(analytics, "message_updated", {
        thread_id: threadId,
        message_id: messageId,
        content_length: content.length,
      });
    }
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
