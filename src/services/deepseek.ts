// src/services/deepseek.ts

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Deepseek (OpenAI互換)クライアント生成
 */
export function createDeepseekClient(apiKey: string) {
  return new OpenAI({
    baseURL: "https://api.deepseek.com", // DeepseekのOpenAI互換エンドポイント
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

/**
 * 同期版: 全部生成が終わってから文字列1つを返す
 */
export async function callDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat"
): Promise<string> {
  const openai = createDeepseekClient(apiKey);
  const res = await openai.chat.completions.create({
    model,
    messages,
  });
  return res.choices[0]?.message?.content ?? "";
}

/**
 * ストリーミング版: Async Generatorでトークンを逐次返す
 * - `for await (const chunk of streamDeepseek(...)) { ... }`
 */
export async function* streamDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat"
): AsyncGenerator<string, void, undefined> {
  const openai = createDeepseekClient(apiKey);

  // stream: true でトークンを部分的に受け取る
  const completion = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  for await (const part of completion) {
    // 部分的に返ってくるトークンはここ
    const delta = part.choices[0]?.delta?.content ?? "";
    if (delta) {
      yield delta;
    }
  }
}
