// HTTP contracts: https://api-docs.deepseek.com/guides/{responses_api,anthropic_api,vision,files_api}/
export const LAB_BASE = "https://api.deepseek.com";
export type LabEndpoint = "responses" | "messages" | "vision";
export type LabModel = "deepseek-flash" | "deepseek-v4-pro";
export const LAB_PATHS: Record<LabEndpoint, string> = {
  responses: "/responses", messages: "/anthropic/v1/messages", vision: "/chat/completions",
};
export type JsonObject = Record<string, unknown>;
export interface LabEvent { event: string; data: string; id?: string }
export interface LabResult { content: string; reasoning: string; usage: JsonObject; raw?: unknown; status?: string }
export interface LabFile { id: string; filename: string; bytes: number; created_at: number; expires_at?: number }
export interface FileList { data: LabFile[]; has_more: boolean; last_id?: string }
export const MIB = 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }

export function defaultLabBody(endpoint: LabEndpoint, model: LabModel = "deepseek-flash"): JsonObject {
  if (endpoint === "responses") return { model, instructions: "You are a concise, helpful assistant.", input: "Explain prompt caching in two sentences.", max_output_tokens: 1024, stream: true };
  if (endpoint === "messages") return { model, system: "You are a concise, helpful assistant.", messages: [{ role: "user", content: [{ type: "text", text: "Explain prompt caching in two sentences." }] }], max_tokens: 1024, stream: true };
  return { model: "deepseek-flash", messages: [{ role: "user", content: [{ type: "text", text: "Describe this image and read any visible text." }, { type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg", detail: "auto" } }] }], max_tokens: 1024, stream: true, stream_options: { include_usage: true } };
}

export function parseLabBody(source: string): JsonObject {
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request must be a JSON object.");
  if (new TextEncoder().encode(source).byteLength > 48 * MIB) throw new Error("Request exceeds 48 MiB.");
  return value as JsonObject;
}

export function visionBlock(mode: "url" | "file" | "inline", value: string, detail = "auto"): JsonObject {
  if (mode === "file") {
    if (!/^file-api-[\w-]+$/.test(value)) throw new Error("Enter a file-api-... ID.");
    return { type: "file", file_id: value };
  }
  if (mode === "url") {
    if (value.length > 8192) throw new Error("Image URL exceeds 8192 characters.");
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use a public HTTP(S) image URL without credentials.");
  } else if (!/^data:image\/(jpeg|png|gif|webp);base64,/.test(value)) throw new Error("Select a supported local image.");
  return { type: "image_url", image_url: { url: value, detail } };
}

export async function validateImage(file: Blob, upload = false): Promise<string> {
  if (!file.size || file.size > (upload ? 64 : 32) * MIB) throw new Error(`Image must be nonempty and at most ${upload ? 64 : 32} MiB.`);
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)) return "image/png";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  throw new Error("Only JPEG, PNG, GIF and WebP image content is accepted.");
}

export async function inlineImage(file: File): Promise<string> {
  const mime = await validateImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Cannot read image."));
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`));
    reader.readAsDataURL(file);
  });
}

// Consume lines, not network chunks: UTF-8 and CRLF may be split at any byte.
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<LabEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", event = "message", id: string | undefined, data: string[] = [];
  const line = (value: string): LabEvent | undefined => {
    if (!value) {
      const result = data.length ? { event, data: data.join("\n"), ...(id === undefined ? {} : { id }) } : undefined;
      event = "message"; data = [];
      return result;
    }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? "" : value.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = content;
    if (field === "data") data.push(content);
    if (field === "id" && !content.includes("\0")) id = content;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\n|\r/.exec(buffer))) {
        if (!done && match[0] === "\r" && match.index === buffer.length - 1) break;
        const result = line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (result) yield result;
      }
      if (done) { if (buffer) line(buffer); const result = line(""); if (result) yield result; break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function emptyLabResult(): LabResult { return { content: "", reasoning: "", usage: {} }; }
export function reduceLabEvent(previous: LabResult, payload: unknown, event = "message"): LabResult {
  const p = object(payload), r = { ...previous, usage: { ...previous.usage }, raw: payload };
  const type = string(p.type) || event;
  if (p.error || type === "error" || type === "response.failed") throw new Error(string(object(p.error || object(p.response).error).message) || "API stream failed.");
  if (type === "response.output_text.delta") r.content += string(p.delta);
  if (type === "response.reasoning_text.delta" || type === "response.reasoning_summary_text.delta") r.reasoning += string(p.delta);
  const response = object(p.response);
  if (type.startsWith("response.") && ["response.completed", "response.incomplete"].includes(type)) {
    const final = normalizeLabResponse(response);
    r.content = final.content || r.content; r.reasoning = final.reasoning || r.reasoning;
    r.usage = { ...r.usage, ...final.usage }; r.status = type;
  }
  if (type === "message_start") r.usage = { ...r.usage, ...object(object(p.message).usage) };
  if (type === "content_block_start") {
    const block = object(p.content_block); r.content += string(block.text); r.reasoning += string(block.thinking);
  }
  const delta = object(p.delta);
  if (type === "content_block_delta") { r.content += string(delta.text); r.reasoning += string(delta.thinking); }
  if (type === "message_delta") r.status = string(delta.stop_reason) || r.status;
  for (const choice of list(p.choices)) {
    const c = object(choice), d = object(c.delta);
    r.content += string(d.content); r.reasoning += string(d.reasoning_content);
    r.status = string(c.finish_reason) || r.status;
  }
  r.usage = { ...r.usage, ...object(p.usage) };
  return r;
}

export function normalizeLabResponse(payload: unknown): LabResult {
  const p = object(payload), r = emptyLabResult(); r.raw = payload; r.usage = object(p.usage); r.status = string(p.status) || string(p.stop_reason);
  const blocks = [...list(p.content), ...list(p.output).filter(item => object(item).type !== "reasoning").flatMap(item => list(object(item).content))];
  r.content = blocks.map(b => string(object(b).text)).join("") || string(p.output_text);
  r.reasoning = blocks.map(b => string(object(b).thinking)).join("");
  for (const item of list(p.output)) {
    const i = object(item);
    if (i.type === "reasoning") r.reasoning += [...list(i.content), ...list(i.summary)].map(part => string(object(part).text)).join("");
  }
  for (const choice of list(p.choices)) { const m = object(object(choice).message); r.content += string(m.content); r.reasoning += string(m.reasoning_content); r.status = string(object(choice).finish_reason); }
  return r;
}

export function redactLab(value: string, key: string): string { return key ? value.split(key).join("<REDACTED>") : value; }
export function labHeaders(endpoint: LabEndpoint, key: string): Record<string, string> {
  return endpoint === "messages" ? { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "files-api-2025-04-14" } : { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}
async function checkResponse(response: Response, key: string): Promise<void> {
  if (!response.ok) throw new Error(redactLab(`HTTP ${response.status}: ${(await response.text()).slice(0, 8000)}`, key));
}
export async function runLab(endpoint: LabEndpoint, key: string, body: JsonObject, signal: AbortSignal, onEvent: (event: LabEvent, result: LabResult) => void): Promise<LabResult> {
  if (!key.trim()) throw new Error("An API key is required.");
  parseLabBody(JSON.stringify(body));
  let response: Response;
  try {
    response = await fetch(LAB_BASE + LAB_PATHS[endpoint], { method: "POST", headers: labHeaders(endpoint, key), body: JSON.stringify(body), signal, credentials: "omit", redirect: "error", cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Direct browser request failed: network or CORS restriction. The browser cannot distinguish these failures; check its Network panel. No proxy fallback was used.");
  }
  await checkResponse(response, key);
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return normalizeLabResponse(JSON.parse(redactLab(await response.text(), key)));
  if (!response.body) throw new Error("Response has no readable stream.");
  let result = emptyLabResult();
  let terminal = false;
  for await (const incoming of parseSSE(response.body)) {
    const event = { ...incoming, data: redactLab(incoming.data, key) };
    if (event.data === "[DONE]") {
      onEvent(event, result);
      if (endpoint === "vision") { terminal = true; break; }
      continue;
    }
    const payload: unknown = JSON.parse(event.data);
    // Surface a failed event in the raw inspector before reporting its error.
    onEvent(event, result);
    result = reduceLabEvent(result, payload, event.event);
    onEvent({ ...event, event: "__result" }, result);
    const type = string(object(payload).type) || event.event;
    if ((endpoint === "responses" && ["response.completed", "response.incomplete"].includes(type)) || (endpoint === "messages" && type === "message_stop")) { terminal = true; break; }
  }
  if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
  if (!terminal) throw new Error("Truncated SSE stream: expected a terminal event before the connection closed.");
  return result;
}

export async function labFiles(key: string, operation: "list" | "upload" | "delete", options: { file?: File; id?: string; after?: string; expires?: number; signal?: AbortSignal } = {}): Promise<unknown> {
  if (!key.trim()) throw new Error("An API key is required.");
  let path = "/files", body: FormData | undefined;
  if (operation === "list") { const query = new URLSearchParams({ limit: "100", order: "desc", purpose: "user_data" }); if (options.after) query.set("after", options.after); path += `?${query}`; }
  if (operation === "delete") { if (!options.id) throw new Error("File ID required."); path += `/${encodeURIComponent(options.id)}`; }
  if (operation === "upload") {
    if (!options.file) throw new Error("Select an image.");
    await validateImage(options.file, true);
    body = new FormData(); body.append("purpose", "user_data"); body.append("file", options.file);
    if (options.expires !== undefined) {
      if (!Number.isInteger(options.expires) || options.expires < 3600 || options.expires > 2592000) throw new Error("Expiry must be 3600-2592000 seconds.");
      body.append("expires_after[anchor]", "created_at"); body.append("expires_after[seconds]", String(options.expires));
    }
  }
  const response = await fetch(LAB_BASE + path, { method: operation === "list" ? "GET" : operation === "delete" ? "DELETE" : "POST", headers: { Authorization: `Bearer ${key}` }, body, signal: options.signal, credentials: "omit", redirect: "error", cache: "no-store" });
  await checkResponse(response, key);
  return JSON.parse(redactLab(await response.text(), key));
}

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
export function labCurl(endpoint: LabEndpoint, body: JsonObject, key = ""): string {
  const headers = labHeaders(endpoint, "<DEEPSEEK_API_KEY>");
  return [`curl -N ${quote(LAB_BASE + LAB_PATHS[endpoint])}`, ...Object.entries(headers).map(([k, v]) => `  -H ${quote(`${k}: ${v}`)}`), `  --data-raw ${quote(redactLab(JSON.stringify(body, null, 2), key))}`].join(" \\\n");
}
