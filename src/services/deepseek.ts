// src/services/deepseek.ts

import OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

const isBrowser = typeof window !== "undefined";

export type ChatCompletionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_call_id?: string;
  tool_calls?: ChatCompletionToolCall[];
};

export type DeepseekParameters = {
  frequencyPenalty?: number;
  presencePenalty?: number;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

export type DeepseekToolConfig = {
  tools?: unknown[];
  strict?: boolean;
  responseFormat?: { type: "json_object" };
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

type DeepseekRequestPayload = {
  apiKey: string;
  messages: ChatCompletionMessageParam[];
  model?: string;
  parameters?: DeepseekParameters;
  tools?: unknown[];
  strict?: boolean;
  responseFormat?: { type: "json_object" };
};

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

const CALL_ENDPOINT = "/api/deepseek/call";
const STREAM_ENDPOINT = "/api/deepseek/stream";

async function parseApiError(response: Response): Promise<Error> {
  let message = `Deepseek proxy request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) {
      message = body.error;
    }
  } catch (parseError) {
    console.error("[deepseek] Failed to parse proxy error response", parseError);
  }
  return new Error(message);
}

async function callDeepseekViaApi(payload: DeepseekRequestPayload): Promise<string> {
  const response = await fetch(CALL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }
  const data = (await response.json()) as { content?: string };
  return data.content ?? "";
}

function createIterableFromReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncIterable<ChatCompletionChunk> {
  const decoder = new TextDecoder();
  return (async function* () {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            yield JSON.parse(line) as ChatCompletionChunk;
          }
          newlineIndex = buffer.indexOf("\n");
        }

        if (done) {
          const trimmed = buffer.trim();
          if (trimmed) {
            yield JSON.parse(trimmed) as ChatCompletionChunk;
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  })();
}

async function streamDeepseekViaApi(
  payload: DeepseekRequestPayload
): Promise<DeepseekStream> {
  const controller = new AbortController();
  const response = await fetch(STREAM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (!response.body) {
    throw new Error("Browser response does not contain a readable body");
  }

  const reader = response.body.getReader();
  const iterable = createIterableFromReader(reader);
  return new DeepseekStreamWrapper(iterable, () => {
    controller.abort();
    reader.cancel().catch(() => {
      /* ignore */
    });
  });
}

/**
 * 同期版: 全部生成が終わってから文字列1つを返す
 * 署名・戻り値はそのまま
 */
export async function callDeepseekServer(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<string> {
  const baseURL = toolConfig?.strict
    ? "https://api.deepseek.com/beta"
    : "https://api.deepseek.com";
  const openai = createDeepseekClient(apiKey, baseURL);
  const tools = Array.isArray(toolConfig?.tools) ? toolConfig?.tools : undefined;
  const responseFormat = toolConfig?.responseFormat;

  try {
    const res = await openai.chat.completions.create({
      model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...mapParams(parameters),
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (error) {
    console.error("[callDeepseek] Failed to create completion:", error);
    throw error;
  }
}

export async function callDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat",
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
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<DeepseekStream> {
  const baseURL = toolConfig?.strict
    ? "https://api.deepseek.com/beta"
    : "https://api.deepseek.com";
  const openai = createDeepseekClient(apiKey, baseURL);
  const tools = Array.isArray(toolConfig?.tools) ? toolConfig?.tools : undefined;
  const responseFormat = toolConfig?.responseFormat;

  try {
    const iterable = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...mapParams(parameters),
    });
    return new DeepseekStreamWrapper(iterable as AbortableStream);
  } catch (error) {
    console.error(
      "[streamDeepseek] Failed to create streaming completion:",
      error
    );
    throw error;
  }
}

export async function streamDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat",
  parameters?: DeepseekParameters,
  toolConfig?: DeepseekToolConfig
): Promise<DeepseekStream> {
  if (isBrowser) {
    return streamDeepseekServer(apiKey, messages, model, parameters, toolConfig);
  }
  return streamDeepseekServer(apiKey, messages, model, parameters, toolConfig);
}
