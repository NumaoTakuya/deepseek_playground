// src/types/index.d.ts

// Firestore から取得した日付系を any で受ける or Firestore Timestamp型を定義してもOK
// import { Timestamp } from "firebase/firestore";

export interface Thread {
  id: string; // FirestoreドキュメントのIDを格納
  userId: string; // オーナーのユーザーID
  title: string; // トーク（スレッド）のタイトル
  createdAt?: Timestamp; // 作成日時 (サーバータイムスタンプなど)
  updatedAt?: Timestamp; // 更新日時 (サーバータイムスタンプなど)
}

// チャットメッセージの型を定義したい場合
export interface Message {
  id: string; // FirestoreドキュメントのID
  threadId: string; // どのThreadに属するか
  role: "system" | "assistant" | "user";
  content: string; // メッセージ本文
  createdAt?: Timestamp;
}

export interface ChatWindowProps {
  threadId: string;
}
