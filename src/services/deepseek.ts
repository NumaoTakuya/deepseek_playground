// src/services/deepseek.ts

import OpenAI from "openai";
import { executeDeepseek, parseSSE } from "./deepseekApi";
import { buildDeepseekRequest, completionChunk, normalizeCompletion, NativeStreamConverter } from "./deepseekFormats";
import type { ProviderData } from "./deepseekFormats";
export { buildDeepseekRequest } from "./deepseekFormats";
export type { ProviderData, NativeChunk, ApiFormat } from "./deepseekFormats";
import type { DeepseekParameters } from "./deepseekRequest";
export type { DeepseekParameters } from "./deepseekRequest";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam as OpenAIChatCompletionMessageParam,
} from "openai/resources/chat/completions";

const isBrowser = typeof window !== "undefined";

function inspectResponse(value: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("deepseek:response", { detail: value }));
}

export type ChatCompletionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatCompletionMessageParam = OpenAIChatCompletionMessageParam & {
  provider_data?: ProviderData;
  prefix?: boolean;
  reasoning_content?: string | null;
};

export type DeepseekFimParameters = {
  maxTokens?: number;
};

export type DeepseekToolConfig = {
  tools?: unknown[];
  strict?: boolean;
  responseFormat?: { type: "json_object" };
  stop?: string[];
  useBeta?: boolean;
  toolChoice?: string;
};

// ↑ openai@4.x 系を想定。バージョンが違う場合は型名が異なる可能性があります。

type DeepseekStreamEventMap = {
  content: (delta: string) => void;
  message: (payload: { content: string }) => void;
  end: () => void;
};

type AbortableStream = AsyncIterable<ChatCompletionChunk> & {
  controller?: { abort: () => void };
};

class DeepseekStreamWrapper implements AsyncIterable<ChatCompletionChunk> {
  private endHandler?: DeepseekStreamEventMap["end"];

  constructor(
    private readonly stream: AbortableStream,
    private readonly abortFn?: () => void
  ) {}

  [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
    const stream = this.stream;
    return (async function* () {
      for await (const chunk of stream) {
        inspectResponse(chunk);
        yield chunk;
      }
    })();
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
    if (this.abortFn) {
      this.abortFn();
      return;
    }
    this.stream.controller?.abort();
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
export function createDeepseekClient(
  apiKey: string,
  baseURL: string = "https://api.deepseek.com"
) {
  return new OpenAI({
    baseURL,
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

/**
 * 同期版: 全部生成が終わってから文字列1つを返す
 * 署名・戻り値はそのまま
 */
export async function callDeepseekCompletion(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-flash",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
) {
  const request = buildDeepseekRequest(messages, model, { ...parameters, stream: false }, toolConfig);
  const response = await executeDeepseek(request.endpoint, apiKey, request.body, new AbortController().signal, request.url);
  const raw = await response.json();
  const result = { ...normalizeCompletion(raw, parameters?.apiFormat ?? "chat", model), raw_response: raw };
  inspectResponse(raw);
  return result;
}

export async function callDeepseekServer(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model = "deepseek-flash",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<string> {
  const response = await callDeepseekCompletion(apiKey, messages, model, parameters, toolConfig);
  return response.choices[0]?.message?.content ?? "";
}

export async function callDeepseekFimServer(
  apiKey: string,
  prompt: string,
  suffix?: string,
  model: string = "deepseek-flash",
  parameters?: DeepseekFimParameters
): Promise<string> {
  const response = await executeDeepseek("vision", apiKey, {
    model, prompt, stream: false,
    ...(suffix ? { suffix } : {}),
    ...(typeof parameters?.maxTokens === "number" ? { max_tokens: parameters.maxTokens } : {}),
  }, new AbortController().signal, "https://api.deepseek.com/beta/completions");
  const result = await response.json();
  inspectResponse(result);
  return result.choices?.[0]?.text ?? "";
}

export async function callDeepseekFim(
  apiKey: string,
  prompt: string,
  suffix?: string,
  model: string = "deepseek-flash",
  parameters?: DeepseekFimParameters
): Promise<string> {
  if (isBrowser) {
    return callDeepseekFimServer(apiKey, prompt, suffix, model, parameters);
  }
  return callDeepseekFimServer(apiKey, prompt, suffix, model, parameters);
}

export async function callDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-flash",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<string> {
  if (isBrowser) {
    return callDeepseekServer(apiKey, messages, model, parameters, toolConfig);
  }
  return callDeepseekServer(apiKey, messages, model, parameters, toolConfig);
}

/**
 * ストリーミング版:
 * v4の beta.stream に近い使い勝手を保つため、
 * v6の AsyncIterable を薄いラッパで返す（for-await対応 / .on / .toReadableStream 互換を最小実装）
 * 署名は不変（戻り値は旧v4互換の薄いラッパ）
 */
export async function streamDeepseekServer(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-flash",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<DeepseekStream> {
  const request = buildDeepseekRequest(messages, model, parameters, toolConfig);
  const controller = new AbortController();
  const response = await executeDeepseek(request.endpoint, apiKey, request.body, controller.signal, request.url);
  const format = parameters?.apiFormat ?? "chat";
  const iterable = (async function* () {
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      yield completionChunk(await response.json(), format, model);
      return;
    }
    if (!response.body) throw new Error("Response has no readable stream.");
    const converter = new NativeStreamConverter(format, model);
    let terminal = false;
    for await (const event of parseSSE(response.body)) {
      if (event.data === "[DONE]") {
        if (format === "chat") { terminal = true; break; }
        continue;
      }
      const payload = JSON.parse(event.data);
      for (const chunk of converter.convert(payload, event.event)) yield chunk;
      const type = payload.type || event.event;
      if ((format === "responses" && ["response.completed", "response.incomplete"].includes(type)) || (format === "messages" && type === "message_stop")) { terminal = true; break; }
    }
    if (controller.signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!terminal) throw new Error("Truncated SSE stream: expected a terminal event before the connection closed.");
  })();
  return new DeepseekStreamWrapper(iterable, () => controller.abort());
}

export async function streamDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-flash",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<DeepseekStream> {
  if (isBrowser) {
    return streamDeepseekServer(apiKey, messages, model, parameters, toolConfig);
  }
  return streamDeepseekServer(apiKey, messages, model, parameters, toolConfig);
}
