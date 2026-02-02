import type { NextApiRequest, NextApiResponse } from "next";
import {
  streamDeepseekServer,
  type ChatCompletionMessageParam,
  type DeepseekParameters,
  type DeepseekStream,
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

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
  maxDuration: 60,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const flushableRes = res as NextApiResponse & { flush?: () => void };
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
    responseFormat?: { type: "json_object" };
  };
  const tools = Array.isArray(req.body?.tools) ? req.body.tools : undefined;
  const strict =
    typeof req.body?.strict === "boolean" ? req.body.strict : undefined;
  const responseFormat =
    req.body?.responseFormat &&
    typeof req.body.responseFormat === "object" &&
    req.body.responseFormat.type === "json_object"
      ? { type: "json_object" as const }
      : undefined;

  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "Missing apiKey" });
    return;
  }
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Missing messages" });
    return;
  }

  let stream: DeepseekStream | null = null;
  const handleAbort = () => {
    try {
      stream?.abort();
    } catch (abortError) {
      console.error("[api/deepseek/stream] Abort failed", abortError);
    }
  };

  try {
    stream = await streamDeepseekServer(apiKey, messages, model, parameters, {
      tools,
      strict,
      responseFormat,
    });
    req.on("close", handleAbort);

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "identity",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Transfer-Encoding": "chunked",
    });
    res.flushHeaders();

    for await (const chunk of stream) {
      res.write(`${JSON.stringify(chunk)}\n`);
      flushableRes.flush?.();
    }
    res.end();
  } catch (error) {
    console.error("[api/deepseek/stream] Failed to stream Deepseek", error);
    if (res.headersSent) {
      res.end();
    } else {
      res
        .status(extractStatus(error))
        .json({ error: extractMessage(error) || "Failed to stream Deepseek" });
    }
  } finally {
    req.removeListener("close", handleAbort);
  }
}
