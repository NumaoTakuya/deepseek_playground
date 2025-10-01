// src/services/deepseek.ts

import OpenAI from "openai";

export type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type DeepseekParameters = {
  frequencyPenalty?: number;
  presencePenalty?: number;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

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
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters
): Promise<string> {
  const openai = createDeepseekClient(apiKey);

  try {
    const res = await openai.chat.completions.create({
      model,
      messages,
      ...(typeof parameters?.frequencyPenalty === "number"
        ? { frequency_penalty: parameters.frequencyPenalty }
        : {}),
      ...(typeof parameters?.presencePenalty === "number"
        ? { presence_penalty: parameters.presencePenalty }
        : {}),
      ...(typeof parameters?.temperature === "number"
        ? { temperature: parameters.temperature }
        : {}),
      ...(typeof parameters?.topP === "number"
        ? { top_p: parameters.topP }
        : {}),
      ...(typeof parameters?.maxTokens === "number"
        ? { max_tokens: parameters.maxTokens }
        : {}),
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (error) {
    // error の型はライブラリによって異なる場合があります (AxiosError or OpenAIError など)
    console.error("[callDeepseek] Failed to create completion:", error);

    // 必要に応じて、エラーコードに応じた分岐を行う (例: 429 Too Many Requests, 401 Unauthorized, etc.)
    // if (isAxiosError(error) && error.response?.status === 429) {
    //   console.warn("[callDeepseek] Rate limit exceeded. Retrying or notifying user...");
    // }

    // 上位に再スローする (UI側で再試行やエラーメッセージを表示できる)
    throw error;
  }
}

/**
 * ストリーミング版:
 * openai.beta.chat.completions.stream(...) は
 * 「Promise<ChatCompletionStream>」を返す。
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
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters
) {
  const openai = createDeepseekClient(apiKey);

  try {
    // openai@4.x の "beta" API を使用
    const stream = await openai.beta.chat.completions.stream({
      model,
      messages,
      stream: true,
      ...(typeof parameters?.frequencyPenalty === "number"
        ? { frequency_penalty: parameters.frequencyPenalty }
        : {}),
      ...(typeof parameters?.presencePenalty === "number"
        ? { presence_penalty: parameters.presencePenalty }
        : {}),
      ...(typeof parameters?.temperature === "number"
        ? { temperature: parameters.temperature }
        : {}),
      ...(typeof parameters?.topP === "number"
        ? { top_p: parameters.topP }
        : {}),
      ...(typeof parameters?.maxTokens === "number"
        ? { max_tokens: parameters.maxTokens }
        : {}),
    });
    return stream;
  } catch (error) {
    console.error(
      "[streamDeepseek] Failed to create streaming completion:",
      error
    );

    // 必要ならエラーコード判別 (429, 401 など)
    // 例:
    // if (isAxiosError(error) && error.response?.status === 429) {
    //   console.warn("[streamDeepseek] Rate limit exceeded. Consider retry or user notification.");
    // }

    throw error;
  }
}
