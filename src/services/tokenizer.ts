export async function fetchTokenCount(text: string): Promise<number | null> {
  if (!text) return 0;

  try {
    const response = await fetch("/api/tokenizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("[fetchTokenCount] Failed:", response.status);
      return null;
    }

    const data = (await response.json()) as { length?: number };
    if (typeof data.length !== "number") {
      console.error("[fetchTokenCount] Invalid response:", data);
      return null;
    }

    return data.length;
  } catch (error) {
    console.error("[fetchTokenCount] Error:", error);
    return null;
  }
}
