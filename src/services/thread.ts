// src/services/thread.ts
import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

import { logEvent, analytics } from "./firebase";

// スレッド作成 (userIdは必ずauth.uidを渡す)
export async function createThread(userId: string, title: string) {
  const ref = collection(db, "threads");
  const docRef = await addDoc(ref, {
    userId, // ← ルール上、これが auth.uid と一致する必要あり
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Log thread creation event
  if (analytics) {
    logEvent(analytics, "thread_created", {
      user_id: userId,
      thread_id: docRef.id,
      title_length: title.length,
    });
  }

  return docRef.id;
}

// スレッド一覧取得 (自分のthreadsだけ)
export async function listMyThreads(userId: string) {
  const ref = collection(db, "threads");
  // ルール上、 userId == auth.uid のdocしか読み取り許可されない
  const q = query(ref, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// タイトル更新 (例: userがスレッド名を変えたいとき)
export async function updateThreadTitle(threadId: string, newTitle: string) {
  const threadRef = doc(db, "threads", threadId);
  await updateDoc(threadRef, {
    title: newTitle,
    updatedAt: serverTimestamp(),
  });

  if (analytics) {
    logEvent(analytics, "thread_title_updated", {
      thread_id: threadId,
      new_title_length: newTitle.length,
    });
  }
}

// スレッド削除
export async function deleteThread(threadId: string) {
  await deleteDoc(doc(db, "threads", threadId));

  if (analytics) {
    logEvent(analytics, "thread_deleted", {
      thread_id: threadId,
    });
  }
}
