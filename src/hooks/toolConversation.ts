import type { ChatCompletionMessageParam } from "../services/deepseek";
import type { Message } from "../types/index";
import { attachmentBlocks } from "../services/deepseekAttachments";

export { parseDeepseekOptions as parseRequestOptions } from "../services/deepseekRequest";

export function replayMessage(message: Message): ChatCompletionMessageParam[] {
  if (message.role === "user" && message.attachments?.length) {
    return [{ role: "user", content: [
      ...(message.content ? [{ type: "text", text: message.content }] : []),
      ...attachmentBlocks(message.attachments),
    ] } as unknown as ChatCompletionMessageParam];
  }
  if (message.api_messages?.length) return message.api_messages;
  return [{ role: message.role, content: message.content,
    ...(message.role === "assistant" && message.thinking_content != null
      ? { reasoning_content: message.thinking_content } : {}) }];
}

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolPass = {
  partialContent: string;
  partialReasoningContent: string;
  finalFinishReason: string | null;
  toolCalls: ToolCall[];
  providerData?: { format: string; content?: unknown[]; output?: unknown[] };
};

export async function runToolConversation(options: {
  conversation: ChatCompletionMessageParam[];
  stream: (conversation: ChatCompletionMessageParam[]) => Promise<ToolPass>;
  resolve: (calls: ToolCall[]) => Promise<ChatCompletionMessageParam[]>;
  signal: AbortSignal;
  persist: (pass: ToolPass, history: ChatCompletionMessageParam[]) => Promise<void>;
  history?: ChatCompletionMessageParam[];
  prefix?: string;
}) {
  const conversation = [...options.conversation];
  const history = [...(options.history ?? [])];
  const checkAbort = () => {
    if (options.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
  };
  const abortable = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Generation stopped", "AbortError"));
    options.signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => options.signal.removeEventListener("abort", abort));
    if (options.signal.aborted) abort();
  });
  for (let round = 0; ; round++) {
    checkAbort();
    const pass = await abortable(options.stream([...conversation]));
    checkAbort();
    const assistant: ChatCompletionMessageParam = {
      role: "assistant",
      content: `${round === 0 ? options.prefix ?? "" : ""}${pass.partialContent}`,
      reasoning_content: pass.partialReasoningContent,
      ...(pass.providerData ? { provider_data: pass.providerData } : {}),
      ...(pass.toolCalls.length ? { tool_calls: pass.toolCalls } : {}),
    };
    if (conversation.at(-1)?.prefix) conversation.pop();
    if (!pass.toolCalls.length) {
      history.push(assistant);
      await options.persist(pass, history);
      return pass;
    }
    if (round >= 8) throw new Error("Tool call round limit (8) exceeded");
    const results = await abortable(options.resolve(pass.toolCalls));
    checkAbort();
    conversation.push(assistant, ...results);
    history.push(assistant, ...results);
    await options.persist(pass, history);
  }
}
