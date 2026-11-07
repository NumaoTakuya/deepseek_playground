import { describe, it, expect, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
import { callDeepseekCompletion, callDeepseekServer } from "../src/services/deepseek";

describe("DeepSeek completion preservation", () => {
  it("retains reasoning, tool calls and usage without breaking text callers", async () => {
    const completion = { choices: [{ message: { content: "result", reasoning_content: "reasoning", tool_calls: [{ id: "call_1" }] }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, prompt_cache_hit_tokens: 2 } };
    create.mockResolvedValue(completion);
    expect(await callDeepseekCompletion("test-key", [{ role: "user", content: "hi" }], "deepseek-flash")).toEqual(completion);
    expect(await callDeepseekServer("test-key", [{ role: "user", content: "hi" }])).toBe("result");
    expect(create.mock.lastCall?.[0]).toHaveProperty("thinking", { type: "enabled" });
  });
});
