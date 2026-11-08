import { validateImage, validateVisionBody, visionBlock } from "./deepseekLab";
import type { JsonObject } from "./deepseekLab";

export type AttachmentDetail = "auto" | "low" | "high" | "original";
export interface Attachment { id: string; kind: "url" | "file"; value: string; name: string; detail?: AttachmentDetail }

export function attachmentBlocks(attachments: Attachment[]): JsonObject[] {
  if (attachments.length > 600) throw new Error("At most 600 images are allowed per request.");
  const blocks = attachments.map(attachment => {
    if (!attachment || typeof attachment.id !== "string" || !attachment.id || typeof attachment.name !== "string" || typeof attachment.value !== "string" || !["url", "file"].includes(attachment.kind)) throw new Error("Invalid attachment.");
    return visionBlock(attachment.kind === "file" ? "file" : attachment.value.startsWith("data:") ? "inline" : "url", attachment.value, attachment.detail);
  });
  validateVisionBody({ model: "deepseek-flash", messages: [{ role: "user", content: blocks }] });
  return blocks;
}

export async function validateAttachmentImage(file: File, upload = true, count = 1): Promise<void> {
  const mime = await validateImage(file, upload);
  const url = URL.createObjectURL(new Blob([file], { type: mime }));
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const limit = count >= 15 ? 4096 : 8192;
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > limit || image.naturalHeight > limit) reject(new Error(`Image dimensions must be at most ${limit} px per side.`));
        else resolve();
      };
      image.onerror = () => reject(new Error("Image cannot be decoded."));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
