import { afterEach, describe, it, expect, vi } from "vitest";
import { callDeepseekCompletion, callDeepseekServer } from "../src/services/deepseek";

describe("DeepSeek completion preservation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("retains reasoning, tool calls and usage without breaking text callers", async () => {
    const completion = { choices: [{ message: { content: "result", reasoning_content: "reasoning", tool_calls: [{ id: "call_1" }] }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, prompt_cache_hit_tokens: 2 } };
    const fetchMock = vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json(completion));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callDeepseekCompletion("test-key", [{ role: "user", content: "hi" }], "deepseek-flash")).toMatchObject(completion);
    expect(await callDeepseekServer("test-key", [{ role: "user", content: "hi" }])).toBe("result");
    expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))).toHaveProperty("thinking", { type: "enabled" });
  });
});
