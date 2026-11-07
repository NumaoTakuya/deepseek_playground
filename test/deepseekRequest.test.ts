import { describe, it, expect } from "vitest";
import { mapDeepseekParameters, resolveToolChoice } from "../src/services/deepseekRequest";
import { getModelLimits } from "../src/services/deepseekModels";

describe("DeepSeek model parameters", () => {
  it("rejects forced tools in thinking mode", () => {
    expect(() => resolveToolChoice("deepseek-flash", true, "required")).toThrow();
    expect(resolveToolChoice("deepseek-v4-pro", false, "weather")).toEqual({ type: "function", function: { name: "weather" } });
    expect(resolveToolChoice("deepseek-flash", true, "none")).toBe("none");
  });
  it("omits unsupported sampling in thinking mode and clamps Flash top_p", () => {
    expect(mapDeepseekParameters("deepseek-flash", { temperature: 0.2, frequencyPenalty: 1, presencePenalty: 1, topP: 0.5 })).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "high", top_p: 0.95 });
  });
  it("allows sampling for non-thinking Pro and ignores non-thinking Flash top_p", () => {
    expect(mapDeepseekParameters("deepseek-v4-pro", { thinkingEnabled: false, topP: 0.5, temperature: 0.2 })).toEqual({ thinking: { type: "disabled" }, top_p: 0.5, temperature: 0.2 });
    expect(mapDeepseekParameters("deepseek-flash", { thinkingEnabled: false, topP: 0.5 })).not.toHaveProperty("top_p");
  });
  it("preserves legacy models and exposes current output limits", () => {
    expect(mapDeepseekParameters("deepseek-chat", { temperature: 0.5 })).toEqual({ temperature: 0.5 });
    expect(getModelLimits("deepseek-chat").maxTokensLimit).toBe(8192);
    expect(getModelLimits("deepseek-flash").maxTokensLimit).toBe(393216);
  });
});
