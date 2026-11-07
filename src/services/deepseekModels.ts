export const DEFAULT_MODEL = "deepseek-flash";
export const CURRENT_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;

export function getModelLimits(model: string) {
  if (CURRENT_MODELS.some((value) => value === model)) {
    return { defaultMaxTokens: 32768, maxTokensLimit: 393216 };
  }
  return model === "deepseek-reasoner"
    ? { defaultMaxTokens: 32768, maxTokensLimit: 65536 }
    : { defaultMaxTokens: 4096, maxTokensLimit: 8192 };
}

export function isCurrentModel(model: string) {
  return CURRENT_MODELS.some((value) => value === model);
}
