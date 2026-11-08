import type { ChatCompletion, ChatCompletionChunk } from "openai/resources/chat/completions";
import type { ChatCompletionMessageParam, DeepseekParameters, DeepseekToolConfig } from "./deepseek";
import { mapDeepseekParameters, resolveToolChoice, validateDeepseekOptions } from "./deepseekRequest";
import { LAB_BASE, LAB_PATHS, validateVisionBody, validateApiBody, type JsonObject, type LabEndpoint } from "./deepseekApi";

export type ApiFormat = "chat" | "responses" | "messages";
export type ProviderData = { format: string; content?: unknown[]; output?: unknown[] };
export type NativeChunk = ChatCompletionChunk & { provider_data?: ProviderData; raw_event?: unknown; raw_response?: unknown };
const obj = (v: unknown): JsonObject => v && typeof v === "object" && !Array.isArray(v) ? v as JsonObject : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string => typeof v === "string" ? v : "";

function parts(content: unknown, format: ApiFormat, assistant = false): unknown {
  if (!Array.isArray(content)) return content ?? "";
  return content.map(value => {
    const p = obj(value);
    if (p.type === "text") return { ...p, type: format === "responses" ? assistant ? "output_text" : "input_text" : "text" };
    if (p.type === "file") {
      if (format === "responses") return { type: "input_image", file_id: p.file_id };
      return { type: "image", source: { type: "file", file_id: p.file_id } };
    }
    if (p.type === "image_url") {
      const image = obj(p.image_url), url = str(image.url);
      if (format === "responses") return { type: "input_image", image_url: url, ...(image.detail ? { detail: image.detail } : {}) };
      if (url.startsWith("data:")) {
        const comma = url.indexOf(",");
        return { type: "image", source: { type: "base64", media_type: url.slice(5, url.indexOf(";")), data: url.slice(comma + 1) } };
      }
      return { type: "image", source: { type: "url", url } };
    }
    throw new Error(`Unsupported canonical content block: ${String(p.type)}`);
  });
}

export function buildDeepseekRequest(messages: ChatCompletionMessageParam[], model = "deepseek-flash", parameters: DeepseekParameters = {}, toolConfig: DeepseekToolConfig = {}): { endpoint: LabEndpoint; body: JsonObject; url: string } {
  const format = parameters.apiFormat ?? "chat";
  if (!["chat", "responses", "messages"].includes(format)) throw new Error("Unsupported API format.");
  const endpoint: LabEndpoint = format === "chat" ? "vision" : format;
  validateDeepseekOptions(parameters.extraBody ?? {});
  for (const m of messages) {
    if (format !== "chat" && m.prefix) throw new Error("Prefix completion is supported only by Chat Completions.");
    if (m.provider_data && m.provider_data.format !== format) throw new Error("Native assistant history belongs to a different API format. Start a new conversation before switching formats.");
    if (Array.isArray(m.content)) parts(m.content, format === "chat" ? "responses" : format, m.role === "assistant");
  }
  validateVisionBody({ model, messages });
  const mapped = mapDeepseekParameters(model, parameters);
  const tools = toolConfig.tools ?? [];
  const choice = tools.length ? resolveToolChoice(model, parameters.thinkingEnabled, toolConfig.toolChoice) : undefined;
  const body: JsonObject = { model, ...mapped, stream: parameters.stream !== false };
  if (format === "chat") {
    body.messages = messages.map(({ provider_data: _native, ...m }) => m);
    if (body.stream) body.stream_options = { include_usage: true };
    if (tools.length) { body.tools = tools; body.tool_choice = choice; }
    if (toolConfig.responseFormat) body.response_format = toolConfig.responseFormat;
    if (toolConfig.stop?.length) body.stop = toolConfig.stop;
  } else {
    delete body.frequency_penalty; delete body.presence_penalty;
    if (format === "responses") {
      delete body.thinking; delete body.reasoning_effort; delete body.max_tokens;
      body.reasoning = { effort: parameters.thinkingEnabled === false ? "none" : parameters.reasoningEffort ?? "high" };
      if (parameters.maxTokens !== undefined) body.max_output_tokens = parameters.maxTokens;
      body.input = messages.flatMap<unknown>(m => {
        if (m.role === "assistant" && m.provider_data?.output) return m.provider_data.output;
        if (m.role === "tool") return [{ type: "function_call_output", call_id: m.tool_call_id, output: parts(m.content, format) }];
        const result: unknown[] = [];
        if (m.role === "assistant" && m.reasoning_content) result.push({ type: "reasoning", content: [{ type: "reasoning_text", text: m.reasoning_content }] });
        if (m.content) result.push({ role: m.role, content: parts(m.content, format, m.role === "assistant") });
        if (m.role === "assistant") for (const call of m.tool_calls ?? []) {
          if (call.type !== "function") throw new Error("Unsupported canonical tool call.");
          result.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
        }
        return result;
      });
      if (tools.length) { body.tools = tools.map(t => obj(t).type === "function" ? ({ type: "function", ...obj(obj(t).function), ...(toolConfig.strict ? { strict: true } : {}) }) : t); body.tool_choice = typeof choice === "string" ? choice : { type: "function", name: obj(obj(choice).function).name }; }
      if (toolConfig.responseFormat) body.text = { format: toolConfig.responseFormat };
      if (toolConfig.stop?.length) throw new Error("Stop sequences are not supported by the Responses API.");
    } else {
      delete body.reasoning_effort;
      if (parameters.reasoningEffort) body.output_config = { effort: parameters.reasoningEffort };
      body.system = messages.filter(m => m.role === "system" || m.role === "developer").map(m => typeof m.content === "string" ? m.content : arr(m.content).map(p => str(obj(p).text)).join("")).join("\n");
      const nativeMessages: JsonObject[] = [];
      for (const m of messages) {
        if (m.role === "system" || m.role === "developer") continue;
        let content: unknown[];
        if (m.role === "tool") content = [{ type: "tool_result", tool_use_id: m.tool_call_id, content: parts(m.content, format) }];
        else if (m.role === "assistant" && m.provider_data?.content) content = m.provider_data.content;
        else {
          const converted = parts(m.content, format);
          content = typeof converted === "string" ? converted ? [{ type: "text", text: converted }] : [] : arr(converted);
          if (m.role === "assistant") {
            if (m.reasoning_content) content.unshift({ type: "thinking", thinking: m.reasoning_content });
            for (const c of m.tool_calls ?? []) {
              if (c.type !== "function") throw new Error("Unsupported canonical tool call.");
              content.push({ type: "tool_use", id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments) });
            }
          }
        }
        const role = m.role === "assistant" ? "assistant" : "user";
        const last = nativeMessages.at(-1);
        if (last?.role === role) last.content = [...arr(last.content), ...content];
        else nativeMessages.push({ role, content });
      }
      body.messages = nativeMessages;
      if (tools.length) { body.tools = tools.map(t => { const f = obj(obj(t).function); return { name: f.name, description: f.description, input_schema: f.parameters }; }); body.tool_choice = typeof choice === "string" ? { type: choice === "required" ? "any" : choice } : { type: "tool", name: obj(obj(choice).function).name }; }
      if (toolConfig.responseFormat) throw new Error("JSON response format is not supported by the Messages API.");
      if (toolConfig.stop?.length) body.stop_sequences = toolConfig.stop;
    }
  }
  Object.assign(body, parameters.extraBody);
  validateApiBody(endpoint, body);
  if (format !== "chat" && (body.prefix || body.suffix || body.prompt)) throw new Error("Prefix/FIM completion requires Chat Completions.");
  const url = LAB_BASE + (format === "chat" && (toolConfig.useBeta || toolConfig.strict || messages.some(m => m.prefix)) ? "/beta" : "") + LAB_PATHS[endpoint];
  return { endpoint, body, url };
}

function usage(value: unknown, format: ApiFormat): JsonObject {
  const u = obj(value);
  if (format === "chat") return u;
  const input = Number(u.input_tokens ?? 0) + (format === "messages" ? Number(u.cache_read_input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0) : 0);
  const output = Number(u.output_tokens ?? 0);
  return { ...u, prompt_tokens: input, completion_tokens: output, total_tokens: input + output, prompt_tokens_details: { cached_tokens: format === "messages" ? Number(u.cache_read_input_tokens ?? 0) : obj(u.input_tokens_details).cached_tokens ?? 0 }, completion_tokens_details: obj(u.output_tokens_details) };
}
function finish(reason: unknown, tools = false): string {
  if (reason === "max_tokens" || reason === "incomplete" || reason === "length") return "length";
  if (tools || reason === "tool_use" || reason === "tool_calls") return "tool_calls";
  return "stop";
}

export function normalizeCompletion(payload: unknown, format: ApiFormat, model: string): ChatCompletion & { provider_data?: ProviderData } {
  const p = obj(payload);
  if (p.error) throw new Error(str(obj(p.error).message) || "API request failed.");
  if (format === "chat") return payload as ChatCompletion;
  const blocks = format === "messages" ? arr(p.content) : arr(p.output);
  let content = "", reasoning = "";
  const calls: unknown[] = [];
  for (const value of blocks) {
    const b = obj(value);
    if (b.type === "text") content += str(b.text);
    if (b.type === "message") content += arr(b.content).map(c => str(obj(c).text)).join("");
    if (b.type === "thinking") reasoning += str(b.thinking);
    if (b.type === "reasoning") reasoning += [...arr(b.content), ...arr(b.summary)].map(c => str(obj(c).text)).join("");
    if (b.type === "tool_use" || b.type === "function_call") calls.push({ id: b.call_id ?? b.id, type: "function", function: { name: b.name, arguments: b.type === "tool_use" ? JSON.stringify(b.input) : b.arguments } });
  }
  return { id: str(p.id), object: "chat.completion", created: Number(p.created_at ?? 0), model: str(p.model) || model, choices: [{ index: 0, message: { role: "assistant", content, reasoning_content: reasoning, refusal: null, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish(p.stop_reason ?? p.status, calls.length > 0), logprobs: null }], usage: usage(p.usage, format), provider_data: format === "responses" ? { format, output: blocks } : { format, content: blocks } } as unknown as ChatCompletion & { provider_data: ProviderData };
}

export function completionChunk(payload: unknown, format: ApiFormat, model: string): NativeChunk {
  const c = normalizeCompletion(payload, format, model);
  return { ...c, raw_response: payload, object: "chat.completion.chunk", choices: c.choices.map(choice => ({ index: choice.index, delta: { ...choice.message, ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls.map((call, index) => ({ ...call, index })) } : {}) }, finish_reason: choice.finish_reason, logprobs: null })) } as NativeChunk;
}

// Retain native blocks independently of rendered deltas, especially thinking signatures.
export class NativeStreamConverter {
  private native: JsonObject = { content: [], usage: {} };
  private arguments = new Map<number, string>();
  private toolIndexes = new Map<number, number>();
  private toolIds = new Map<string, number>();
  private text = "";
  private reasoning = "";
  constructor(private format: ApiFormat, private model: string) {}
  convert(payload: unknown, event: string): NativeChunk[] {
    const p = obj(payload), type = str(p.type) || event;
    if (p.error || type === "response.failed" || type === "error") throw new Error(str(obj(p.error ?? obj(p.response).error).message) || "API stream failed.");
    if (this.format === "chat") return [{ ...p, raw_event: payload } as NativeChunk];
    const delta: JsonObject = {};
    let final = false;
    if (this.format === "responses") {
      const index = Number(p.output_index ?? 0), item = obj(p.item);
      if (type === "response.output_text.delta") { delta.content = str(p.delta); this.text += str(p.delta); }
      if (type === "response.reasoning_text.delta" || type === "response.reasoning_summary_text.delta") { delta.reasoning_content = str(p.delta); this.reasoning += str(p.delta); }
      if (type === "response.output_item.added" && item.type === "function_call") {
        const toolIndex = this.toolIndexes.size; this.toolIndexes.set(index, toolIndex);
        this.toolIds.set(str(item.call_id ?? item.id), index);
        this.arguments.set(index, str(item.arguments));
        delta.tool_calls = [{ index: toolIndex, id: item.call_id ?? item.id, type: "function", function: { name: item.name, arguments: str(item.arguments) } }];
      }
      if (type === "response.function_call_arguments.delta" || type === "response.function_call_arguments.done") {
        const previous = this.arguments.get(index) ?? "";
        const addition = type.endsWith(".done") ? str(p.arguments).slice(previous.length) : str(p.delta);
        this.arguments.set(index, previous + addition);
        if (addition) delta.tool_calls = [{ index: this.toolIndexes.get(index) ?? index, function: { arguments: addition } }];
      }
      if (type === "response.completed" || type === "response.incomplete") { this.native = obj(p.response); final = true; }
    } else {
      const index = Number(p.index ?? 0), blocks = arr(this.native.content);
      if (type === "message_start") this.native = { ...obj(p.message), content: [...arr(obj(p.message).content)] };
      if (type === "content_block_start") {
        const block = { ...obj(p.content_block) }; blocks[index] = block; this.native.content = blocks;
        if (block.type === "text") { delta.content = str(block.text); this.text += str(block.text); }
        if (block.type === "thinking") { delta.reasoning_content = str(block.thinking); this.reasoning += str(block.thinking); }
        if (block.type === "tool_use") { const ti = this.toolIndexes.size; this.toolIndexes.set(index, ti); this.toolIds.set(str(block.id), index); this.arguments.set(index, ""); delta.tool_calls = [{ index: ti, id: block.id, type: "function", function: { name: block.name, arguments: "" } }]; }
      }
      if (type === "content_block_delta") {
        const d = obj(p.delta), block = obj(blocks[index]);
        if (d.type === "text_delta") { block.text = str(block.text) + str(d.text); delta.content = d.text; this.text += str(d.text); }
        if (d.type === "thinking_delta") { block.thinking = str(block.thinking) + str(d.thinking); delta.reasoning_content = d.thinking; this.reasoning += str(d.thinking); }
        if (d.type === "signature_delta") block.signature = str(block.signature) + str(d.signature);
        if (d.type === "input_json_delta") { const args = (this.arguments.get(index) ?? "") + str(d.partial_json); this.arguments.set(index, args); delta.tool_calls = [{ index: this.toolIndexes.get(index) ?? index, function: { arguments: str(d.partial_json) } }]; }
      }
      if (type === "content_block_stop" && this.arguments.has(index)) { const args = this.arguments.get(index); if (args) obj(blocks[index]).input = JSON.parse(args); }
      if (type === "message_delta") { Object.assign(this.native, obj(p.delta)); this.native.usage = { ...obj(this.native.usage), ...obj(p.usage) }; }
      if (type === "message_stop") final = true;
    }
    const chunk = (d: JsonObject): NativeChunk => ({ id: str(this.native.id), object: "chat.completion.chunk", created: 0, model: this.model, choices: [{ index: 0, delta: d, finish_reason: null }] } as NativeChunk);
    const result = Object.keys(delta).length ? [chunk(delta)] : [];
    if (final) {
      const complete = completionChunk(this.native, this.format, this.model);
      const message = obj(complete.choices[0]?.delta);
      // Final response is authoritative, but never re-emit already streamed text/tools.
      const tail: JsonObject = {};
      if (str(message.content).startsWith(this.text)) tail.content = str(message.content).slice(this.text.length);
      if (str(message.reasoning_content).startsWith(this.reasoning)) tail.reasoning_content = str(message.reasoning_content).slice(this.reasoning.length);
      const finalTools: unknown[] = [];
      const blocks = arr(this.format === "responses" ? this.native.output : this.native.content);
      for (let index = 0; index < blocks.length; index++) {
        const block = obj(blocks[index]);
        if (block.type !== "function_call" && block.type !== "tool_use") continue;
        const full = block.type === "tool_use" ? JSON.stringify(block.input) : str(block.arguments);
        const nativeIndex = this.toolIds.get(str(block.call_id ?? block.id));
        const toolIndex = nativeIndex === undefined ? undefined : this.toolIndexes.get(nativeIndex);
        if (toolIndex === undefined) finalTools.push({ index: this.toolIndexes.size + finalTools.length, id: block.call_id ?? block.id, type: "function", function: { name: block.name, arguments: full } });
        else {
          const previous = this.arguments.get(nativeIndex!) ?? "";
          if (!full.startsWith(previous)) throw new Error("Final tool arguments disagree with streamed arguments.");
          if (full.length > previous.length) finalTools.push({ index: toolIndex, function: { arguments: full.slice(previous.length) } });
        }
      }
      if (finalTools.length) tail.tool_calls = finalTools;
      complete.choices[0].delta = tail;
      result.push(complete);
    }
    if (!result.length) result.push(chunk({}));
    result[0].raw_event = payload;
    return result;
  }
}
