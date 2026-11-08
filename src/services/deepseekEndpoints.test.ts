import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLabBody, LAB_ENDPOINTS, LabHttpError, labCurl, labEndpointUrl, runLab, validateApiBody, type LabEndpoint } from "./deepseekApi";

afterEach(() => vi.unstubAllGlobals());
describe("independent API endpoints", () => {
  it("does not label a validation failure as a sent request", async () => {
    const fetch = vi.fn();
    const onRequest = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(runLab("search", "key", { query: "" }, new AbortController().signal, vi.fn(), "", onRequest)).rejects.toThrow("query");
    expect(fetch).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
  });
  it.each(["search", "fetch", "models", "balance", "file-info", "file-delete"] as LabEndpoint[])("sends exactly one %s request without chaining to a model", async endpoint => {
    const payload = { results: [{ url: "https://example.com", summary: "Result" }] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const body = defaultLabBody(endpoint);
    const signal = new AbortController().signal;
    const result = await runLab(endpoint, "user-key", body, signal, vi.fn(), "file-api-test");
    expect(fetch).toHaveBeenCalledTimes(1);
    const method = LAB_ENDPOINTS[endpoint].method;
    expect(fetch).toHaveBeenCalledWith(labEndpointUrl(endpoint, "file-api-test"), expect.objectContaining({ method, signal, headers: expect.objectContaining({ Authorization: "Bearer user-key" }), redirect: "error", credentials: "omit" }));
    expect(fetch.mock.calls[0][1].body).toBe(method === "POST" ? JSON.stringify(body) : undefined);
    expect(result.raw).toEqual(payload);
    expect(result.httpStatus).toBe(200);
    expect(labCurl(endpoint, body, "", labEndpointUrl(endpoint, "file-api-test"))).not.toContain('"model"');
  });
  it("uses DELETE explicitly in curl and does not put credentials in output", () => {
    const curl = labCurl("file-delete", {}, "secret", labEndpointUrl("file-delete", "file-api-test"));
    expect(curl).toContain("-X DELETE");
    expect(curl).not.toContain("--data-raw");
    expect(curl).not.toContain("secret");
    expect(() => labEndpointUrl("file-info", "../user/balance")).toThrow();
  });
  it("validates documented search and fetch fields without inventing model settings", () => {
    expect(() => validateApiBody("search", { query: "🧪".repeat(128), count: 50, need_content: true, ori_question: null })).not.toThrow();
    for (const body of [{ query: " " }, { query: "a".repeat(129) }, { query: "x", count: 51 }, { query: "x", need_content: 1 }]) expect(() => validateApiBody("search", body)).toThrow();
    expect(() => validateApiBody("fetch", { url: "https://example.com" })).not.toThrow();
    expect(() => validateApiBody("fetch", { url: "https://user:pass@example.com" })).toThrow();
    expect(() => validateApiBody("fetch", { url: "file:///etc/passwd" })).toThrow();
  });
  it("returns redacted provider error JSON with the HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "user-secret is invalid" } }), { status: 401 })));
    try {
      await runLab("models", "user-secret", {}, new AbortController().signal, vi.fn());
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LabHttpError);
      expect(error).toMatchObject({ status: 401, raw: { error: { message: "<REDACTED> is invalid" } } });
    }
  });
  it("supports FIM text in streaming and nonstream responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ text: "return 1", finish_reason: "stop" }] }))).mockResolvedValueOnce(new Response('data: {"choices":[{"text":"return 2","finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const body = defaultLabBody("fim");
    expect((await runLab("fim", "key", body, new AbortController().signal, vi.fn())).content).toBe("return 1");
    expect((await runLab("fim", "key", body, new AbortController().signal, vi.fn())).content).toBe("return 2");
    expect(fetch.mock.calls[0][0]).toBe("https://api.deepseek.com/beta/completions");
  });
});
