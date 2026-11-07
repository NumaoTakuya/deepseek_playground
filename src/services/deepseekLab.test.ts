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
