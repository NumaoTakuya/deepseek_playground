import type { NextApiRequest, NextApiResponse } from "next";
import {
  callDeepseekServer,
  type ChatCompletionMessageParam,
  type DeepseekParameters,
} from "../../../services/deepseek";

function extractStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const value = (error as { status?: number }).status;
    if (typeof value === "number") {
      return value;
    }
  }
  return 500;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { apiKey, messages, model, parameters } = req.body as {
    apiKey?: string;
    messages?: ChatCompletionMessageParam[];
    model?: string;
    parameters?: DeepseekParameters;
    tools?: unknown[];
    strict?: boolean;
  };
  const tools = Array.isArray(req.body?.tools) ? req.body.tools : undefined;
  const strict =
    typeof req.body?.strict === "boolean" ? req.body.strict : undefined;

  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "Missing apiKey" });
    return;
  }
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Missing messages" });
    return;
  }

  try {
    const content = await callDeepseekServer(apiKey, messages, model, parameters, {
      tools,
      strict,
    });
    res.status(200).json({ content });
  } catch (error) {
    console.error("[api/deepseek/call] Failed to call Deepseek", error);
    res
      .status(extractStatus(error))
      .json({ error: extractMessage(error) || "Failed to call Deepseek" });
  }
}
