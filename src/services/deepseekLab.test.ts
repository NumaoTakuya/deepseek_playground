import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLabBody, labCurl, normalizeLabResponse, parseSSE, runLab } from "./deepseekLab";

function bytes(text: string, size = 1) {
  const data = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < data.length; i += size) c.enqueue(data.slice(i, i + size)); c.close(); } });
}
function stream(text: string) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes(text), { headers: { "content-type": "text/event-stream" } }))); }
afterEach(() => vi.unstubAllGlobals());
describe("Responses primary checkpoint", () => {
  it("parses fragmented UTF-8, CRLF, multiline data and comments", async () => {
    const events = [];
    for await (const event of parseSSE(bytes(': ping\r\nevent: example\r\nid: 7\r\ndata: {"text":\r\ndata: "日本語"}\r\n\r\n'))) events.push(event);
    expect(events).toEqual([{ event: "example", id: "7", data: '{"text":\n"日本語"}' }]);
  });
  it("retains Responses content, reasoning summaries, usage and complete raw schema", () => {
    const payload = { output: [{ type: "reasoning", content: [{ type: "reasoning_text", text: "thought" }], summary: [{ type: "summary_text", text: "summary" }] }, { type: "message", content: [{ type: "output_text", text: "answer" }] }], usage: { input_tokens: 12, output_tokens: 5, output_tokens_details: { reasoning_tokens: 3 } }, status: "completed", id: "resp_1" };
    const result = normalizeLabResponse(payload);
    expect(result.content).toBe("answer");
    expect(result.reasoning).toBe("thoughtsummary");
    expect(result.usage).toEqual(payload.usage); expect(result.raw).toBe(payload);
  });
  it("streams deltas and completes with full usage", async () => {
    stream('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":4,"output_tokens":1}}}\n\n');
    const result = await runLab("responses", "secret", defaultLabBody("responses"), new AbortController().signal, vi.fn());
    expect(result.content).toBe("hello"); expect(result.usage).toEqual({ input_tokens: 4, output_tokens: 1 }); expect(result.status).toBe("response.completed");
    expect(fetch).toHaveBeenCalledWith("https://api.deepseek.com/responses", expect.objectContaining({ credentials: "omit", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer secret" }) }));
  });
  it.each(["responses", "messages", "vision"] as const)("rejects missing terminal for %s", async endpoint => {
    stream('data: {"type":"ping"}\n\n');
    await expect(runLab(endpoint, "secret", {}, new AbortController().signal, vi.fn())).rejects.toThrow("Truncated SSE");
  });
  it("does not accept chat DONE as a Responses terminal", async () => {
    stream('data: [DONE]\n\n');
    await expect(runLab("responses", "secret", {}, new AbortController().signal, vi.fn())).rejects.toThrow("Truncated SSE");
  });
  it("accepts incomplete and surfaces failed terminal errors", async () => {
    stream('data: {"type":"response.incomplete","response":{"status":"incomplete","usage":{"output_tokens":10}}}\n\n');
    expect((await runLab("responses", "secret", {}, new AbortController().signal, vi.fn())).status).toBe("response.incomplete");
    stream('data: {"type":"response.failed","response":{"error":{"message":"overloaded"}}}\n\n');
    await expect(runLab("responses", "secret", {}, new AbortController().signal, vi.fn())).rejects.toThrow("overloaded");
  });
  it("redacts credential in HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('bad secret', { status: 401 })));
    await expect(runLab("responses", "secret", {}, new AbortController().signal, vi.fn())).rejects.toThrow("HTTP 401: bad <REDACTED>");
  });
  it("reports network/CORS explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(runLab("responses", "secret", {}, new AbortController().signal, vi.fn())).rejects.toThrow("network or CORS");
  });
  it("preserves abort errors", async () => {
    const abort = new AbortController(); abort.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(runLab("responses", "secret", {}, abort.signal, vi.fn())).rejects.toMatchObject({ name: "AbortError" });
  });
  it("nonstream JSON preserves usage and raw schema; cURL never includes the key", async () => {
    const payload = { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 4 } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    const result = await runLab("responses", "secret", {}, new AbortController().signal, vi.fn());
    expect(result.raw).toEqual(payload); expect(result.content).toBe("ok");
    const curl = labCurl("responses", { input: "secret's" }, "secret");
    expect(curl).not.toContain("secret"); expect(curl).toContain("<DEEPSEEK_API_KEY>"); expect(curl).toContain(`'"'"'`);
  });
});

describe("Anthropic Messages checkpoint", () => {
  it("uses Anthropic request schema and exact HTTP path/headers", async () => {
    const body = defaultLabBody("messages", "deepseek-v4-pro");
    expect(body).toMatchObject({ model: "deepseek-v4-pro", max_tokens: 1024, system: expect.any(String), messages: [{ role: "user", content: [{ type: "text", text: expect.any(String) }] }] });
    expect(body).not.toHaveProperty("input");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ content: [{ type: "thinking", thinking: "reason" }, { type: "text", text: "answer" }], usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 2 }, stop_reason: "end_turn" })));
    const result = await runLab("messages", "secret", body, new AbortController().signal, vi.fn());
    expect(result).toMatchObject({ content: "answer", reasoning: "reason", status: "end_turn", usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 2 } });
    expect(fetch).toHaveBeenCalledWith("https://api.deepseek.com/anthropic/v1/messages", expect.objectContaining({ headers: expect.objectContaining({ "x-api-key": "secret", "anthropic-version": "2023-06-01", "anthropic-beta": "files-api-2025-04-14" }) }));
    const curl = labCurl("messages", body);
    expect(curl).toContain("/anthropic/v1/messages"); expect(curl).toContain("x-api-key: <DEEPSEEK_API_KEY>");
  });
  it("combines fragmented thinking/text blocks and usage until message_stop", async () => {
    const payloads = [
      { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 12, output_tokens: 0, cache_read_input_tokens: 3 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "reason" } },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "日本語" } },
      { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 9 } },
      { type: "message_stop" },
    ];
    stream(payloads.map(p => `event: ${p.type}\r\ndata: ${JSON.stringify(p)}\r\n\r\n`).join(""));
    const events = vi.fn();
    const result = await runLab("messages", "secret", {}, new AbortController().signal, events);
    expect(result).toMatchObject({ content: "日本語", reasoning: "reason", status: "max_tokens", usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 3 }, raw: { type: "message_stop" } });
    expect(events.mock.calls.filter(([e]) => e.event !== "__result")).toHaveLength(payloads.length);
  });
  it("rejects message_delta without message_stop and surfaces Anthropic error events", async () => {
    stream('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n');
    await expect(runLab("messages", "secret", {}, new AbortController().signal, vi.fn())).rejects.toThrow("Truncated SSE");
    stream('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Try later"}}\n\n');
    const events = vi.fn();
    await expect(runLab("messages", "secret", {}, new AbortController().signal, events)).rejects.toThrow("Try later");
    expect(events.mock.calls[0][0].event).toBe("error");
  });
});
