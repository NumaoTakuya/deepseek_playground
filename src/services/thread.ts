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

// スレッド作成 (userIdは必ずauth.uidを渡す)
export async function createThread(userId: string, title: string) {
  const ref = collection(db, "threads");
  const docRef = await addDoc(ref, {
    userId, // ← ルール上、これが auth.uid と一致する必要あり
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
}

// スレッド削除
export async function deleteThread(threadId: string) {
  await deleteDoc(doc(db, "threads", threadId));
}
