// src/services/deepseek.ts
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export function createDeepseekClient(apiKey: string) {
  return new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

export async function callDeepseek(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  model: string = "deepseek-chat"
) {
  const openai = createDeepseekClient(apiKey);
  const res = await openai.chat.completions.create({
    model,
    messages,
  });
  return res.choices[0].message?.content || "";
}
