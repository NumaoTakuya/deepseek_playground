import { afterEach, describe, expect, it, vi } from "vitest";
import { labFiles } from "./deepseekLab";

afterEach(() => vi.unstubAllGlobals());
describe("Files API", () => {
  it("lists files with a pagination cursor and bearer authentication", async () => {
    const payload = { data: [], has_more: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    expect(await labFiles("test-key", "list", { after: "file-api-last" })).toEqual(payload);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("after=file-api-last");
    expect(init).toMatchObject({ method: "GET", headers: { Authorization: "Bearer test-key" } });
  });
  it("uploads multipart images with purpose and expiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "file-api-new" })));
    const file = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "image.png", { type: "image/png" });
    const onRequest = vi.fn();
    await labFiles("test-key", "upload", { file, expires: 86400, onRequest });
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", url: "https://api.deepseek.com/files", multipart: expect.objectContaining({ purpose: "user_data", file: { filename: "image.png", bytes: file.size, type: "image/png" } }) }));
    expect(JSON.stringify(onRequest.mock.calls)).not.toContain("test-key");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form.get("purpose")).toBe("user_data");
    expect(form.get("expires_after[seconds]")).toBe("86400");
    expect(form.get("file")).toBeInstanceOf(File);
  });
  it("rejects invalid expiry before upload and deletes the exact selected file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ deleted: true })));
    const file = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "image.png");
    await expect(labFiles("test-key", "upload", { file, expires: 1 })).rejects.toThrow("Expiry");
    expect(fetch).not.toHaveBeenCalled();
    await labFiles("test-key", "delete", { id: "file-api-selected" });
    expect(fetch).toHaveBeenCalledWith("https://api.deepseek.com/files/file-api-selected", expect.objectContaining({ method: "DELETE" }));
  });
});
