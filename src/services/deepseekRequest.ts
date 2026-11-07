import { isCurrentModel } from "./deepseekModels";

export type DeepseekParameters = {
  frequencyPenalty?: number;
  presencePenalty?: number;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  thinkingEnabled?: boolean;
  reasoningEffort?: "low" | "high" | "max";
};

export function mapDeepseekParameters(model: string, p: DeepseekParameters = {}) {
  const current = isCurrentModel(model);
  const thinking = current ? p.thinkingEnabled !== false : model === "deepseek-reasoner";
  const output: Record<string, unknown> = {};
  if (current) {
    output.thinking = { type: thinking ? "enabled" : "disabled" };
    if (thinking) output.reasoning_effort = p.reasoningEffort ?? "high";
  }
  if (!thinking) {
    if (typeof p.frequencyPenalty === "number") output.frequency_penalty = p.frequencyPenalty;
    if (typeof p.presencePenalty === "number") output.presence_penalty = p.presencePenalty;
    if (typeof p.temperature === "number") output.temperature = p.temperature;
  }
  if (typeof p.topP === "number") {
    if (!current || (model === "deepseek-flash" && thinking) || (model === "deepseek-v4-pro" && !thinking)) {
      output.top_p = model === "deepseek-flash" && thinking ? Math.max(0.95, p.topP) : p.topP;
    }
  }
  if (typeof p.maxTokens === "number") output.max_tokens = p.maxTokens;
  return output;
}
