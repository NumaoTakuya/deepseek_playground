import { isCurrentModel } from "./deepseekModels";
import type { ChatCompletionToolChoiceOption } from "openai/resources/chat/completions";

const RESERVED_FIELDS = new Set(["model", "messages", "input", "instructions", "system", "stream", "stream_options", "prompt", "suffix", "prefix", "apiKey", "api_key", "authorization", "headers", "url", "baseURL", "endpoint"]);

export function validateDeepseekOptions(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request options must be a JSON object.");
  for (const name of Object.keys(value)) if (RESERVED_FIELDS.has(name)) throw new Error(`Request option '${name}' is reserved.`);
}

export function parseDeepseekOptions(raw: string): Record<string, unknown> {
  const value: unknown = raw.trim() ? JSON.parse(raw) : {};
  validateDeepseekOptions(value);
  return value;
}

export function resolveToolChoice(model: string, thinkingEnabled: boolean | undefined, choice = "auto"): ChatCompletionToolChoiceOption {
  const thinking = model === "deepseek-reasoner" || (isCurrentModel(model) && thinkingEnabled === true);
  if (thinking && choice !== "auto" && choice !== "none") {
    throw new Error("Disable Thinking before requiring a tool or selecting a function.");
  }
  if (choice === "auto" || choice === "none" || choice === "required") return choice;
  return { type: "function", function: { name: choice } };
}

export type DeepseekParameters = {
  apiFormat?: "chat" | "responses" | "messages";
  stream?: boolean;
  extraBody?: Record<string, unknown>;
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
  const thinking = current ? p.thinkingEnabled === true : model === "deepseek-reasoner";
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
