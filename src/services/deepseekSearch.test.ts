import { afterEach, describe, expect, it, vi } from "vitest";
import { searchHandlers, SEARCH_TOOLS, withSearchTools } from "./deepseekSearch";
import { buildDeepseekRequest } from "./deepseekFormats";

afterEach(() => vi.unstubAllGlobals());

describe("built-in web tools", () => {
  it("is opt-in and preserves custom tools without accepting reserved names", () => {
    const custom = { type: "function", function: { name: "custom" } };
    expect(withSearchTools([custom])).toEqual([custom]);
    expect(withSearchTools([custom], true)).toEqual([custom, ...SEARCH_TOOLS]);
    expect(() => withSearchTools(SEARCH_TOOLS, true)).toThrow("Reserved");
  });

  it.each(["chat", "responses", "messages"] as const)("exposes search through %s function tools", (apiFormat) => {
    const request = buildDeepseekRequest([], "deepseek-flash", { apiFormat }, { tools: withSearchTools([], true) });
    expect(JSON.stringify(request.body.tools)).toContain("deepseek_web_search");
    expect(JSON.stringify(request.body.tools)).toContain("deepseek_web_fetch");
  });

  it("uses fixed provider endpoints, passes cancellation and limits returned search data", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Source", url: "https://example.com", summary: "a".repeat(9000), content: "omit" }] })));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const result = await searchHandlers(" key ", signal).deepseek_web_search({ query: "latest news" });
    expect(fetch).toHaveBeenCalledWith("https://api.deepseek.com/v1/tools/search", expect.objectContaining({ signal, redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer key" }), body: JSON.stringify({ query: "latest news", count: 5, need_content: false }) }));
    expect("results" in result && result.results[0].summary).toHaveLength(4000);
    expect(JSON.stringify(result)).not.toContain('"content"');
  });

  it("validates arguments before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const handlers = searchHandlers("key");
    for (const query of ["", " ", "a".repeat(129), 1]) await expect(handlers.deepseek_web_search({ query })).rejects.toThrow();
    for (const url of ["file:///etc/passwd", "https://user:pass@example.com", "invalid"]) await expect(handlers.deepseek_web_fetch({ url })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds page content and exposes provider errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ title: "Page", content: "a".repeat(30000) }))).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Insufficient balance" } }), { status: 402 }));
    vi.stubGlobal("fetch", fetch);
    const handlers = searchHandlers("key");
    const result = await handlers.deepseek_web_fetch({ url: "https://example.com" });
    expect("content" in result && result.content).toHaveLength(24000);
    await expect(handlers.deepseek_web_search({ query: "test" })).rejects.toThrow("402: Insufficient balance");
  });
});
