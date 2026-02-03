// src/types/index.d.ts

// Firestore から取得した日付系を any で受ける or Firestore Timestamp型を定義してもOK
// import { Timestamp } from "firebase/firestore";

export interface Thread {
  id: string; // FirestoreドキュメントのIDを格納
  userId: string; // オーナーのユーザーID
  title: string; // トーク（スレッド）のタイトル
  createdAt?: Timestamp; // 作成日時 (サーバータイムスタンプなど)
  updatedAt?: Timestamp; // 更新日時 (サーバータイムスタンプなど)
  parentThreadId?: string;
  branchFromMessageId?: string;
  branchFromTitle?: string;
  branchedAt?: Timestamp;
}

// チャットメッセージの型を定義したい場合
export interface Message {
  id: string; // FirestoreドキュメントのID
  threadId: string; // どのThreadに属するか
  role: "system" | "assistant" | "user";
  content: string; // メッセージ本文
  token_count?: number;
  thinking_content?: string | null;
  finish_reason?: string | null;
  kind?: "branch_marker";
  branch_thread_id?: string;
  branch_thread_title?: string;
  branch_from_message_id?: string;
  branch_created_at?: string;
  createdAt?: Timestamp;
}

export interface ChatWindowProps {
  threadId: string;
}
