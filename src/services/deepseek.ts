// src/services/deepseek.ts

import OpenAI from "openai";
import type { Stream } from "openai/core/streaming";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

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

type DeepseekStreamEventMap = {
  content: (delta: string) => void;
  message: (payload: { content: string }) => void;
  end: () => void;
};

class DeepseekStreamWrapper implements AsyncIterable<ChatCompletionChunk> {
  private endHandler?: DeepseekStreamEventMap["end"];

  constructor(private readonly stream: Stream<ChatCompletionChunk>) {}

  [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
    return this.stream[Symbol.asyncIterator]();
  }

  on<Event extends keyof DeepseekStreamEventMap>(
    event: Event,
    handler: DeepseekStreamEventMap[Event]
  ): this {
    if (event === "end") {
      this.endHandler = handler as DeepseekStreamEventMap["end"];
      return this;
    }

    void (async () => {
      try {
        if (event === "content") {
          const contentHandler = handler as DeepseekStreamEventMap["content"];
          for await (const chunk of this.stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              contentHandler(delta);
            }
          }
        } else if (event === "message") {
          const messageHandler = handler as DeepseekStreamEventMap["message"];
          let full = "";
          for await (const chunk of this.stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              full += delta;
            }
          }
          messageHandler({ content: full });
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("[streamDeepseek] Stream handler error:", error);
      } finally {
        this.notifyEnd();
      }
    })();

    return this;
  }

  toReadableStream(): ReadableStream<Uint8Array> {
    const iterator = this.stream[Symbol.asyncIterator]();
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      },
      async cancel() {
        await iterator.return?.();
      },
    });
  }

  abort(): void {
    this.stream.controller.abort();
  }

  private notifyEnd(): void {
    if (this.endHandler) {
      this.endHandler();
    }
  }
}

export type DeepseekStream = DeepseekStreamWrapper;

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
 * 署名は不変（戻り値は旧v4互換の薄いラッパ）
 */
export async function streamDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters
): Promise<DeepseekStream> {
  const openai = createDeepseekClient(apiKey);

  try {
    const iterable = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
      ...mapParams(parameters),
    });
    return new DeepseekStreamWrapper(iterable);
  } catch (error) {
    console.error(
      "[streamDeepseek] Failed to create streaming completion:",
      error
    );
    throw error;
  }
}
