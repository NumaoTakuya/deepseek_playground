// src/hooks/useThreads.ts (例)

import { useState, useEffect } from "react";
import { db } from "../services/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  Timestamp,
} from "firebase/firestore";

export interface Thread {
  id: string;
  userId: string;
  title: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** ログイン中のユーザーの threads をリアルタイム取得 */
export function useThreads(userId: string | undefined) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // ここで "userId" で絞り込む (重要！)
    const ref = collection(db, "threads");
    const q = query(
      ref,
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Thread, "id">),
      }));
      setThreads(data as Thread[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  return { threads, loading };
}
