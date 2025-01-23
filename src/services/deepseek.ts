// src/services/deepseek.ts

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
// ↑ openai@4.x 系を想定。バージョンが違う場合は型名が異なる可能性があります。

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
 * ストリーミング版:
 * openai.beta.chat.completions.stream(...) は
 * 「Promise<ChatCompletionStream>」を返す。
 * そのため、この関数も Promise で包んで返す。
 *
 * 呼び出し側では:
 *    const stream = await streamDeepseek(apiKey, messages, model);
 *    for await (const chunk of stream) {
 *      ...
 *    }
 */
export async function streamDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat"
) {
  const openai = createDeepseekClient(apiKey);
  // openai@4.x の "beta" API を使用
  const stream = await openai.beta.chat.completions.stream({
    model,
    messages,
    stream: true,
  });
  return stream;
}
