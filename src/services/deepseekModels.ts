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

// USD per million tokens: cache-hit/off-peak lower bound, cache-miss/peak upper bound.
export function estimateModelCost(model: string, input: number, output: number) {
  if (!isCurrentModel(model)) return null;
  const rates = model === "deepseek-v4-pro" ? [0.022, 1.98, 1.32, 3.96] : [0.003, 0.6, 0.3, 1.2];
  return { lower: (input * rates[0] + output * rates[1]) / 1e6, upper: (input * rates[2] + output * rates[3]) / 1e6 };
}
