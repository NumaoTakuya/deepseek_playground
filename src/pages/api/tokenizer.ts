import type { NextApiRequest, NextApiResponse } from "next";

const TOKENIZER_ENDPOINT =
  process.env.TOKENIZER_ENDPOINT ??
  "https://tokenizer-83331309911.asia-northeast1.run.app";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { text } = req.body as { text?: string };
  if (typeof text !== "string") {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    const response = await fetch(TOKENIZER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `Tokenizer upstream error ${response.status}` });
    }

    const data = (await response.json()) as { length?: number };
    if (typeof data.length !== "number") {
      return res.status(502).json({ error: "Invalid tokenizer response" });
    }

    return res.status(200).json({ length: data.length });
  } catch (error) {
    console.error("[api/tokenizer] Failed:", error);
    return res.status(502).json({ error: "Tokenizer fetch failed" });
  }
}
