import { afterEach, describe, expect, it, vi } from "vitest";
import { attachmentBlocks, validateAttachmentImage } from "./deepseekAttachments";
import type { Attachment } from "./deepseekAttachments";

afterEach(() => vi.unstubAllGlobals());
const url: Attachment = { id: "url", kind: "url", value: "https://example.com/image.png", name: "Image", detail: "high" };
describe("attachmentBlocks", () => {
  it("serializes URLs and hosted file IDs without mutating persisted metadata", () => {
    const files: Attachment[] = [url, { id: "local", kind: "file", value: "file-api-abc", name: "photo.png" }];
    const before = JSON.stringify(files);
    expect(attachmentBlocks(files)).toEqual([{ type: "image_url", image_url: { url: url.value, detail: "high" } }, { type: "file", file_id: "file-api-abc" }]);
    expect(JSON.stringify(files)).toBe(before);
  });
  it("preserves existing Lab inline input", () => {
    expect(attachmentBlocks([{ ...url, value: "data:image/png;base64,YWJj" }])[0]).toMatchObject({ type: "image_url" });
  });
  it("rejects malformed metadata, unsafe URLs, IDs and details", () => {
    for (const patch of [{ kind: "other" }, { id: "" }, { name: null }, { value: "javascript:alert(1)" }, { value: "https://user:secret@example.com/a.png" }, { detail: "invalid" }, { kind: "file", value: "not-a-file-id" }]) {
      expect(() => attachmentBlocks([{ ...url, ...patch } as Attachment])).toThrow();
    }
    expect(() => attachmentBlocks(Array(601).fill(url))).toThrow("600");
    expect(attachmentBlocks([])).toEqual([]);
  });
});

describe("local image validation", () => {
  const file = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "photo.png");
  function decoder(width: number, height: number, fail = false) {
    vi.stubGlobal("Image", class {
      naturalWidth = width; naturalHeight = height;
      onload?: () => void; onerror?: () => void;
      set src(_value: string) { queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); }
    });
  }
  it("decodes shared upload/inline inputs and enforces per-side and 15-image limits", async () => {
    decoder(8192, 20); await expect(validateAttachmentImage(file())).resolves.toBeUndefined();
    decoder(8193, 20); await expect(validateAttachmentImage(file())).rejects.toThrow("8192");
    decoder(4097, 20); await expect(validateAttachmentImage(file(), false, 15)).rejects.toThrow("4096");
  });
  it("rejects corrupt and unsupported content", async () => {
    decoder(0, 0, true); await expect(validateAttachmentImage(file())).rejects.toThrow("decoded");
    await expect(validateAttachmentImage(new File(["not an image"], "fake.png"))).rejects.toThrow();
  });
});
