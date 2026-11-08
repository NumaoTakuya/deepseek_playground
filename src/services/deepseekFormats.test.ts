import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeepseekRequest, callDeepseekFimServer, streamDeepseek, type ChatCompletionMessageParam } from "./deepseek";
import { completionChunk, NativeStreamConverter } from "./deepseekFormats";
import { defaultLabBody, labCurl, validateApiBody } from "./deepseekApi";

const tools = [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }];
const history: ChatCompletionMessageParam[] = [
  { role: "system", content: "Be brief" },
  { role: "user", content: "lookup" },
  { role: "assistant", content: null, reasoning_content: "think", tool_calls: [{ id: "c1", type: "function", function: { name: "lookup", arguments: '{"x":1}' } }] },
  { role: "tool", tool_call_id: "c1", content: "found" },
  { role: "tool", tool_call_id: "c2", content: "also" },
];
afterEach(() => vi.unstubAllGlobals());

describe("request format conversion", () => {
  it.each(["chat", "responses", "messages"] as const)("defaults Thinking off and honors explicit on for %s", apiFormat => {
    const off = buildDeepseekRequest([], "deepseek-flash", { apiFormat }).body;
    const on = buildDeepseekRequest([], "deepseek-flash", { apiFormat, thinkingEnabled: true }).body;
    if (apiFormat === "responses") {
      expect(off.reasoning).toEqual({ effort: "none" });
      expect(on.reasoning).toEqual({ effort: "high" });
    } else {
      expect(off.thinking).toEqual({ type: "disabled" });
      expect(on.thinking).toEqual({ type: "enabled" });
    }
    const example = defaultLabBody(apiFormat === "chat" ? "vision" : apiFormat);
    expect(apiFormat === "responses" ? example.reasoning : example.thinking).toEqual(apiFormat === "responses" ? { effort: "none" } : { type: "disabled" });
  });
  it("converts reasoning and tool calls to stateless Responses input", () => {
    const { body, endpoint } = buildDeepseekRequest(history, "deepseek-flash", { apiFormat: "responses", thinkingEnabled: false, maxTokens: 200 }, { tools, toolChoice: "lookup" });
    expect(endpoint).toBe("responses");
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.max_output_tokens).toBe(200);
    expect(body.input).toContainEqual({ type: "function_call", call_id: "c1", name: "lookup", arguments: '{"x":1}' });
    expect(body.input).toContainEqual({ type: "function_call_output", call_id: "c1", output: "found" });
    expect(body.tool_choice).toEqual({ type: "function", name: "lookup" });
  });
  it("groups Anthropic tool results and maps thinking and tools", () => {
    const { body } = buildDeepseekRequest(history, "deepseek-flash", { apiFormat: "messages", reasoningEffort: "max" }, { tools });
    expect(body.system).toBe("Be brief");
    expect(body.output_config).toEqual({ effort: "max" });
    expect(body.messages).toMatchObject([{ role: "user" }, { role: "assistant", content: [{ type: "thinking" }, { type: "tool_use", input: { x: 1 } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "c1" }, { type: "tool_result", tool_use_id: "c2" }] }]);
  });
  it.each(["responses", "messages"] as const)("rejects prefix and incompatible native history for %s", apiFormat => {
    expect(() => buildDeepseekRequest([{ role: "assistant", content: "prefix", prefix: true }], "deepseek-flash", { apiFormat })).toThrow(/Prefix/);
    expect(() => buildDeepseekRequest([{ role: "assistant", content: "", provider_data: { format: "chat" } }], "deepseek-flash", { apiFormat })).toThrow(/different API/);
  });
  it("protects canonical request fields and preserves builtin tools", () => {
    expect(() => buildDeepseekRequest([], "deepseek-flash", { extraBody: { messages: [] } })).toThrow(/reserved/i);
    expect(buildDeepseekRequest([], "deepseek-v4-pro", { apiFormat: "responses" }, { tools: [{ type: "web_search" }] }).body.tools).toEqual([{ type: "web_search" }]);
    expect(() => buildDeepseekRequest([], "deepseek-flash", { thinkingEnabled: true }, { tools, toolChoice: "required" })).toThrow(/Thinking/);
  });
  it("matches beta URL in generated curl", () => {
    const request = buildDeepseekRequest([{ role: "assistant", content: "start", prefix: true }]);
    expect(labCurl(request.endpoint, request.body, "", request.url)).toContain("https://api.deepseek.com/beta/chat/completions");
  });
  it.each(["chat", "responses", "messages"] as const)("validates and converts image URL/file IDs for %s", apiFormat => {
    const messages = [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }, { type: "file", file_id: "file-api-test" }] }] as unknown as ChatCompletionMessageParam[];
    const request = buildDeepseekRequest(messages, "deepseek-flash", { apiFormat });
    expect(JSON.stringify(request.body)).toContain("file-api-test");
    expect(() => buildDeepseekRequest(messages, "deepseek-v4-pro", { apiFormat })).toThrow(/deepseek-flash/);
  });
  it("validates native advanced images too", () => {
    expect(() => validateApiBody("responses", { model: "deepseek-v4-pro", input: [{ role: "user", content: [{ type: "input_image", image_url: "https://example.com/a.png" }] }] })).toThrow(/deepseek-flash/);
  });
});

describe("lossless native stream roundtrips", () => {
  it("retains Anthropic thinking signatures and complete tool JSON", () => {
    const c = new NativeStreamConverter("messages", "deepseek-flash");
    const send = (p: Record<string, unknown>) => c.convert(p, String(p.type));
    send({ type: "message_start", message: { id: "m", usage: { input_tokens: 3, cache_read_input_tokens: 2 }, content: [] } });
    send({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } });
    expect(send({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "plan" } })[0].choices[0].delta).toHaveProperty("reasoning_content", "plan");
    send({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-" } });
    send({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "complete" } });
    send({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "c", name: "lookup", input: {} } });
    expect(send({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"x":1}' } })[0].choices[0].delta.tool_calls?.[0].function?.arguments).toBe('{"x":1}');
    send({ type: "content_block_stop", index: 1 });
    send({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 4, cache_read_input_tokens: 2, output_tokens: 5 } });
    const final = send({ type: "message_stop" })[0];
    expect(final.usage).toMatchObject({ prompt_tokens: 6, completion_tokens: 5, total_tokens: 11 });
    expect(final.choices[0].finish_reason).toBe("tool_calls");
    expect(final.provider_data?.content).toEqual([{ type: "thinking", thinking: "plan", signature: "sig-complete" }, { type: "tool_use", id: "c", name: "lookup", input: { x: 1 } }]);
    const request = buildDeepseekRequest([{ role: "assistant", content: null, provider_data: final.provider_data }], "deepseek-flash", { apiFormat: "messages" });
    expect(request.body.messages).toEqual([{ role: "assistant", content: final.provider_data?.content }]);
  });
  it("streams Responses args once and retains raw output including opaque metadata", () => {
    const c = new NativeStreamConverter("responses", "deepseek-flash");
    c.convert({ type: "response.output_item.added", output_index: 2, item: { type: "function_call", call_id: "c", name: "lookup", arguments: "" } }, "");
    const delta = c.convert({ type: "response.function_call_arguments.delta", output_index: 2, delta: "{}" }, "");
    expect(delta[0].choices[0].delta.tool_calls?.[0].function?.arguments).toBe("{}");
    const output = [{ type: "reasoning", content: [{ type: "reasoning_text", text: "plan" }], signature: "opaque" }, { type: "function_call", call_id: "c", name: "lookup", arguments: "{}" }];
    const final = c.convert({ type: "response.completed", response: { id: "r", output, usage: { input_tokens: 3, output_tokens: 2 } } }, "").at(-1)!;
    expect(final.choices[0].delta.tool_calls).toBeUndefined();
    expect(final.provider_data).toEqual({ format: "responses", output });
    expect(final.raw_response).toHaveProperty("id", "r");
    expect(buildDeepseekRequest([{ role: "assistant", content: null, provider_data: final.provider_data }], "deepseek-flash", { apiFormat: "responses" }).body.input).toEqual(output);
  });
  it("normalizes nonstream tool metadata and length finish", () => {
    const chunk = completionChunk({ content: [{ type: "tool_use", id: "c", name: "lookup", input: {} }], stop_reason: "max_tokens", usage: { input_tokens: 1, output_tokens: 2 } }, "messages", "deepseek-flash");
    expect(chunk.choices[0].finish_reason).toBe("length");
    expect(chunk.choices[0].delta.tool_calls?.[0]).toMatchObject({ index: 0, function: { arguments: "{}" } });
  });
});

describe("shared HTTP execution", () => {
  it("stream:false executes JSON and yields a normalized final chunk", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json({ id: "r", output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }], usage: { input_tokens: 2, output_tokens: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const stream = await streamDeepseek("key", [{ role: "user", content: "hi" }], "deepseek-flash", { apiFormat: "responses", stream: false });
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    expect(chunks[0].choices[0].delta.content).toBe("hello");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).stream).toBe(false);
  });
  it("rejects truncated native streams", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n', { headers: { "content-type": "text/event-stream" } })));
    const stream = await streamDeepseek("key", [], "deepseek-flash", { apiFormat: "responses" });
    await expect((async () => { for await (const chunk of stream) void chunk; })()).rejects.toThrow(/Truncated/);
  });
  it("executes FIM through shared HTTP", async () => {
    const f = vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json({ choices: [{ text: "suffix" }] })); vi.stubGlobal("fetch", f);
    expect(await callDeepseekFimServer("key", "prefix")).toBe("suffix");
    expect(f.mock.calls[0][0]).toBe("https://api.deepseek.com/beta/completions");
  });
});
