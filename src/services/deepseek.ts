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
    baseURL: "https://api.deepseek.com",
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

/** v6向け: camelCase → snake_case 変換（外部型は不変） */
function mapParams(p?: DeepseekParameters) {
  if (!p) return {};
  const o: Record<string, number> = {};
  if (typeof p.frequencyPenalty === "number")
    o.frequency_penalty = p.frequencyPenalty;
  if (typeof p.presencePenalty === "number")
    o.presence_penalty = p.presencePenalty;
  if (typeof p.temperature === "number") o.temperature = p.temperature;
  if (typeof p.topP === "number") o.top_p = p.topP;
  if (typeof p.maxTokens === "number") o.max_tokens = p.maxTokens;
  return o;
}

/**
 * 同期版: 全部生成が終わってから文字列1つを返す
 * 署名・戻り値はそのまま
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
      ...mapParams(parameters),
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (error) {
    console.error("[callDeepseek] Failed to create completion:", error);
    throw error;
  }
}

/**
 * ストリーミング版:
 * v4の beta.stream に近い使い勝手を保つため、
 * v6の AsyncIterable を薄いラッパで返す（for-await対応 / .on / .toReadableStream 互換を最小実装）
 * 署名は不変（戻り値は any 相当の互換ラッパ）
 */
export async function streamDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters
) {
  const openai = createDeepseekClient(apiKey);

  try {
    const iterable = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
      ...mapParams(parameters),
    });

    // 互換ラッパ（最低限: for-await / .on('delta'|'message'|'content') / .toReadableStream）
    const wrapper: any = {
      // for await (...) 互換
      [Symbol.asyncIterator]() {
        return iterable[Symbol.asyncIterator]();
      },
      // シンプルな .on 実装（'content' と 'message' を主に想定）
      on(event: string, handler: (arg: any) => void) {
        (async () => {
          if (event === "content") {
            for await (const chunk of iterable as any) {
              const delta = chunk?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length) handler(delta);
            }
            // v4互換の end イベント補助
            if (typeof (wrapper as any)._endHandler === "function") {
              (wrapper as any)._endHandler();
            }
          } else if (event === "message") {
            // 1メッセージまとまりを通知したい場合の簡易合成
            let full = "";
            for await (const chunk of iterable as any) {
              const delta = chunk?.choices?.[0]?.delta?.content ?? "";
              if (delta) full += delta;
            }
            handler({ content: full });
            if (typeof (wrapper as any)._endHandler === "function") {
              (wrapper as any)._endHandler();
            }
          } else if (event === "end") {
            (wrapper as any)._endHandler = handler;
          }
        })();
        return wrapper;
      },
      toReadableStream() {
        // Web ReadableStream を生成（必要最小限）
        const it = iterable[Symbol.asyncIterator]();
        return new ReadableStream({
          async pull(controller) {
            const { value, done } = await it.next();
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(value) + "\n")
            );
          },
          async cancel() {
            if (typeof (it as any).return === "function") {
              await (it as any).return();
            }
          },
        });
      },
    };

    return wrapper;
  } catch (error) {
    console.error(
      "[streamDeepseek] Failed to create streaming completion:",
      error
    );
    throw error;
  }
}
